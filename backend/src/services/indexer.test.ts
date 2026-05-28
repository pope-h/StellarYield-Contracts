import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("../db/index.js", () => ({ query: vi.fn().mockResolvedValue([]) }));
vi.mock("../logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("./stellar.js", () => ({ getSorobanRpc: vi.fn() }));
vi.mock("./yield.js", () => ({ YieldService: vi.fn().mockImplementation(() => ({})) }));

import { rpc, xdr, scValToNative } from "@stellar/stellar-sdk";
import { Indexer } from "./indexer.js";

function makeScSymbol(name: string): xdr.ScVal {
  return xdr.ScVal.scvSymbol(name);
}

function makeScAddress(addr: string): xdr.ScVal {
  return xdr.ScVal.scvString(addr);
}

function makeMockEvent(
  eventType: string,
  contractId: string,
  topics: xdr.ScVal[] = [],
  valueData: xdr.ScVal = xdr.ScVal.scvVoid(),
): rpc.Api.EventResponse {
  const { Contract } = await import("@stellar/stellar-sdk").then((m) => m);
  return {
    type: "contract",
    contractId: new Contract(contractId),
    topic: [makeScSymbol(eventType), ...topics],
    value: valueData,
    ledger: 1000,
    id: `event-${Math.random()}`,
    txHash: "abc123",
    pagingToken: "",
    ledgerClosedAt: new Date().toISOString(),
    transactionIndex: 0,
    operationIndex: 0,
    inSuccessfulContractCall: true,
  } as unknown as rpc.Api.EventResponse;
}

const VAULT_CONTRACT = "CDLZFC3SYJYHZDQA6M57EYUC2XBDA6LQF3M6KFRDZ7TXJYJL2K3B";

describe("Indexer", () => {
  let indexer: Indexer;
  let mockServer: { getEvents: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    mockServer = {
      getEvents: vi.fn().mockResolvedValue({ events: [], latestLedger: 999 }),
    };
    indexer = new Indexer({ server: mockServer as unknown as rpc.Server });
    indexer["_running"] = true;
  });

  it("passes both RPC events to processEvent", async () => {
    const events = [
      makeMockEvent("deposit", VAULT_CONTRACT),
      makeMockEvent("withdraw", VAULT_CONTRACT),
    ];
    mockServer.getEvents.mockResolvedValueOnce({ events, latestLedger: 1005 });
    const spy = vi.spyOn(indexer, "processEvent").mockResolvedValue(undefined);

    await indexer.tick();

    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenCalledWith(events[0]);
    expect(spy).toHaveBeenCalledWith(events[1]);
  });

  it("logs a warning and does not throw on RPC error", async () => {
    mockServer.getEvents.mockRejectedValueOnce(new Error("network error"));
    const { logger } = await import("../logger.js");

    await expect(indexer.tick()).resolves.not.toThrow();
    expect(logger.warn).toHaveBeenCalled();
  });

  it("updates lastLedger to the highest ledger seen", async () => {
    const events = [
      { ...makeMockEvent("deposit", VAULT_CONTRACT), ledger: 1001 },
      { ...makeMockEvent("deposit", VAULT_CONTRACT), ledger: 1005 },
    ];
    mockServer.getEvents.mockResolvedValueOnce({ events, latestLedger: 1010 });
    vi.spyOn(indexer, "processEvent").mockResolvedValue(undefined);

    await indexer.tick();

    expect(indexer["_lastLedger"]).toBe(1005);
  });
});
