import { describe, it, expect } from "vitest";
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
