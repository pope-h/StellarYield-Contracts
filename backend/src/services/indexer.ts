import { rpc, scValToNative } from "@stellar/stellar-sdk";
import { config } from "../config.js";
import { query } from "../db/index.js";
import { logger } from "../logger.js";
import { getSorobanRpc } from "./stellar.js";
import { YieldService } from "./yield.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

function decodeSymbol(topic: rpc.Api.EventResponse["topic"][number]): string {
  try {
    return String(scValToNative(topic) ?? "");
  } catch {
    return "";
  }
}

function decodeAddr(topic: rpc.Api.EventResponse["topic"][number]): string {
  try {
    const v = scValToNative(topic);
    return typeof v === "string" ? v : String(v ?? "");
  } catch {
    return "";
  }
}

function decodeBigInt(val: unknown): bigint {
  if (typeof val === "bigint") return val;
  if (typeof val === "number") return BigInt(Math.trunc(val));
  if (typeof val === "string" && /^-?\d+$/.test(val)) return BigInt(val);
  if (Array.isArray(val) && val.length > 0) return decodeBigInt(val[0]);
  if (val && typeof val === "object") {
    const first = Object.values(val as Record<string, unknown>)[0];
    if (first !== undefined) return decodeBigInt(first);
  }
  return 0n;
}

function decodeValue(ev: rpc.Api.EventResponse): unknown {
  try {
    return scValToNative(ev.value);
  } catch {
    return null;
  }
}

async function storeIndexedEvent(
  contractId: string,
  eventType: string,
  ev: rpc.Api.EventResponse,
  payload: Record<string, unknown>,
): Promise<void> {
  await query(
    `INSERT INTO indexed_events (ledger, tx_hash, contract_id, event_type, payload)
     VALUES ($1, $2, $3, $4, $5)`,
    [ev.ledger, ev.txHash, contractId, eventType, JSON.stringify(payload)],
  );
}

// ── Indexer ────────────────────────────────────────────────────────────────────

export class Indexer {
  private readonly _server: rpc.Server;
  private readonly _yieldService: YieldService;
  private _lastLedger: number;
  private _running: boolean;
  private _timer: ReturnType<typeof setInterval> | null;

  constructor(options?: { server?: rpc.Server; yieldService?: YieldService }) {
    this._server = options?.server ?? getSorobanRpc();
    this._yieldService = options?.yieldService ?? new YieldService();
    this._lastLedger = config.indexer.startLedger;
    this._running = false;
    this._timer = null;
  }

  async start(): Promise<void> {
    this._running = true;
    this._lastLedger = await this._loadLastLedger();
    logger.info({ lastLedger: this._lastLedger }, "Indexer starting");
    await this.tick();
    this._timer = setInterval(
      () => void this.tick(),
      config.indexer.pollIntervalMs,
    );
  }

  stop(): void {
    this._running = false;
    if (this._timer !== null) {
      clearInterval(this._timer);
      this._timer = null;
    }
    logger.info("Indexer stopped");
  }

  async tick(): Promise<void> {
    if (!this._running && this._timer !== null) return;

    const filters: rpc.Api.EventFilter[] = [
      {
        type: "contract",
        ...(config.stellar.vaultFactoryContractId
          ? { contractIds: [config.stellar.vaultFactoryContractId] }
          : {}),
      },
    ];

    let response: rpc.Api.GetEventsResponse;
    try {
      response = await this._server.getEvents({
        startLedger: this._lastLedger + 1,
        filters,
        limit: 100,
      });
    } catch (err) {
      logger.warn(err, "getEvents RPC call failed — skipping tick");
      return;
    }

    let maxLedger = this._lastLedger;
    for (const ev of response.events) {
      await this.processEvent(ev);
      if (ev.ledger > maxLedger) maxLedger = ev.ledger;
    }

    if (maxLedger > this._lastLedger) {
      this._lastLedger = maxLedger;
      await this._saveLastLedger(maxLedger).catch((err) =>
        logger.warn(err, "Failed to persist lastLedger"),
      );
    }
  }

  async processEvent(ev: rpc.Api.EventResponse): Promise<void> {
    if (ev.type !== "contract") return;

    const contractId = ev.contractId?.contractId() ?? "";
    const eventType = decodeSymbol(ev.topic[0]);

    switch (eventType) {
      case "deposit":
        await this._handleDeposit(contractId, ev);
        break;
      case "withdraw":
        await this._handleWithdraw(contractId, ev);
        break;
      case "yield_dis":
        await this._handleYieldDistributed(contractId, ev);
        break;
      default:
        logger.debug({ contractId, eventType }, "Unhandled event type");
    }
  }

  // ── Stub handlers (filled in by subsequent commits) ────────────────────────

  protected async _handleDeposit(
    _contractId: string,
    _ev: rpc.Api.EventResponse,
  ): Promise<void> {}

  protected async _handleWithdraw(
    _contractId: string,
    _ev: rpc.Api.EventResponse,
  ): Promise<void> {}

  protected async _handleYieldDistributed(
    _contractId: string,
    _ev: rpc.Api.EventResponse,
  ): Promise<void> {}

  // ── Ledger state persistence ───────────────────────────────────────────────

  private async _loadLastLedger(): Promise<number> {
    try {
      const rows = await query<{ last_ledger: number }>(
        "SELECT last_ledger FROM indexer_state ORDER BY id DESC LIMIT 1",
      );
      if (rows.length > 0 && rows[0].last_ledger > 0) return rows[0].last_ledger;
    } catch (err) {
      logger.warn(err, "Could not read indexer_state — using config start ledger");
    }
    return config.indexer.startLedger;
  }

  private async _saveLastLedger(ledger: number): Promise<void> {
    await query(
      `INSERT INTO indexer_state (id, last_ledger) VALUES (1, $1)
       ON CONFLICT (id) DO UPDATE SET last_ledger = EXCLUDED.last_ledger, updated_at = NOW()`,
      [ledger],
    );
  }
}

export { decodeAddr, decodeBigInt, decodeSymbol, decodeValue, storeIndexedEvent };
