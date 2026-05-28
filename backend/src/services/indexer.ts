import { xdr, scValToNative } from "@stellar/stellar-sdk";

export class Indexer {
  async start(): Promise<void> {
    throw new Error("Not implemented");
  }

  stop(): void {
    throw new Error("Not implemented");
  }
}

export function parseDepositEvent(rawEvent: any): {
  caller: string;
  receiver: string;
  assets: bigint;
  shares: bigint;
} | null {
  try {
    const topics = rawEvent?.topic || rawEvent?.topics;
    const value = rawEvent?.value || rawEvent?.data;

    if (!topics || topics.length < 3 || !value) return null;

    const parsedTopics = topics.map((t: any) =>
      typeof t === "string" ? xdr.ScVal.fromXDR(t, "base64") : t
    );
    const parsedValue = typeof value === "string" 
      ? xdr.ScVal.fromXDR(value, "base64")
      : value;

    let eventName = "";
    try {
      eventName = scValToNative(parsedTopics[0]);
    } catch {
      return null;
    }

    if (eventName !== "deposit") return null;

    const caller = scValToNative(parsedTopics[1]) as string;
    const receiver = scValToNative(parsedTopics[2]) as string;

    const data = scValToNative(parsedValue) as any;
    const assets = BigInt(Array.isArray(data) ? data[0] : (data?.assets ?? 0));
    const shares = BigInt(Array.isArray(data) ? data[1] : (data?.shares ?? 0));

    return { caller, receiver, assets, shares };
  } catch (error) {
    return null;
  }
}

export function parseYieldDistributedEvent(rawEvent: any): {
  epoch: number;
  amount: bigint;
  timestamp: bigint;
} | null {
  try {
    const topics = rawEvent?.topic || rawEvent?.topics;
    const value = rawEvent?.value || rawEvent?.data;

    if (!topics || topics.length < 2 || !value) return null;

    const parsedTopics = topics.map((t: any) =>
      typeof t === "string" ? xdr.ScVal.fromXDR(t, "base64") : t
    );
    const parsedValue = typeof value === "string" 
      ? xdr.ScVal.fromXDR(value, "base64")
      : value;

    let eventName = "";
    try {
      eventName = scValToNative(parsedTopics[0]);
    } catch {
      return null;
    }

    if (eventName !== "yield_dis") return null;

    const epoch = Number(scValToNative(parsedTopics[1]));

    const data = scValToNative(parsedValue) as any;
    const amount = BigInt(Array.isArray(data) ? data[0] : (data?.amount ?? 0));
    const timestamp = BigInt(Array.isArray(data) ? data[1] : (data?.timestamp ?? 0));

    return { epoch, amount, timestamp };
  } catch (error) {
    return null;
  }
}
