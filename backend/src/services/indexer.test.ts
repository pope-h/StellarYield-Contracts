import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseDepositEvent, parseYieldDistributedEvent } from "./indexer.js";
import { nativeToScVal } from "@stellar/stellar-sdk";

describe("Indexer Event Parsers", () => {
  const account = "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN";

  it("parses valid deposit event", () => {
    const topics = [
      nativeToScVal("deposit"),
      nativeToScVal(account),
      nativeToScVal(account),
    ];
    const data = nativeToScVal([1000n, 1000n]);

    const result = parseDepositEvent({ topics, data });
    expect(result).not.toBeNull();
    expect(result?.caller).toBe(account);
    expect(result?.receiver).toBe(account);
    expect(result?.assets).toBe(1000n);
    expect(result?.shares).toBe(1000n);
  });

  it("handles malformed deposit safely", () => {
    expect(parseDepositEvent(null)).toBeNull();
    expect(parseDepositEvent({})).toBeNull();
    expect(parseDepositEvent({ topics: ["invalid_base64"], data: "invalid" })).toBeNull();
  });

  it("parses yield distributed event", () => {
    const topics = [
      nativeToScVal("yield_dis"),
      nativeToScVal(5),
    ];
    const data = nativeToScVal([5000n, 123456789n]);

    const result = parseYieldDistributedEvent({ topics, data });
    expect(result).not.toBeNull();
    expect(result?.epoch).toBe(5);
    expect(result?.amount).toBe(5000n);
    expect(result?.timestamp).toBe(123456789n);
  });

  it("handles malformed yield event safely", () => {
    expect(parseYieldDistributedEvent(null)).toBeNull();
    expect(parseYieldDistributedEvent({})).toBeNull();
  });
});

vi.mock("./stellar.js", () => ({
  getSorobanRpc: vi.fn(),
}));

vi.mock("../db/index.js", () => ({
  query: vi.fn(),
}));

vi.mock("../logger.js", () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe("Indexer tick", () => {
  const account = "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("leaves lastLedger unchanged when no new ledgers are available", async () => {
    const { getSorobanRpc } = await import("./stellar.js");
    const { Indexer } = await import("./indexer.js");
    const { query } = await import("../db/index.js");

    (getSorobanRpc as any).mockReturnValue({
      getLatestLedger: vi.fn().mockResolvedValue({ sequence: 0 }),
      getEvents: vi.fn(),
    });
    (query as any).mockResolvedValue([]);

    const indexer = new Indexer();
    const before = indexer.lastLedger;
    await indexer.tick();

    expect(indexer.lastLedger).toBe(before);
  });

  it("updates user_vault_positions on a deposit event", async () => {
    const { getSorobanRpc } = await import("./stellar.js");
    const { Indexer } = await import("./indexer.js");
    const { query } = await import("../db/index.js");

    const depositEvent = {
      id: "0000000001",
      contractId: "CCONTRACT123",
      type: "contract",
      ledger: 100,
      txHash: "abc123",
      topic: [
        nativeToScVal("deposit"),
        nativeToScVal(account),
        nativeToScVal(account),
      ],
      value: nativeToScVal([500n, 500n]),
    };

    (getSorobanRpc as any).mockReturnValue({
      getLatestLedger: vi.fn().mockResolvedValue({ sequence: 100 }),
      getEvents: vi.fn().mockResolvedValue({ events: [depositEvent], latestLedger: 100 }),
    });
    (query as any).mockResolvedValue([]);

    const indexer = new Indexer();
    await indexer.tick();

    const calls: string[] = (query as any).mock.calls.map((c: any[]) => c[0] as string);
    expect(calls.some((sql) => sql.includes("user_vault_positions"))).toBe(true);
  });

  it("logs a warning and does not crash when RPC throws", async () => {
    const { getSorobanRpc } = await import("./stellar.js");
    const { Indexer } = await import("./indexer.js");
    const { logger } = await import("../logger.js");

    (getSorobanRpc as any).mockReturnValue({
      getLatestLedger: vi.fn().mockRejectedValue(new Error("RPC unavailable")),
    });

    const indexer = new Indexer();
    await expect(indexer.tick()).resolves.toBeUndefined();
    expect((logger.warn as any).mock.calls.length).toBeGreaterThan(0);
  });
});
