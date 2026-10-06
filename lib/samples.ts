import { diagnose, type TraceReport } from "./model";
export type SampleId = "pending" | "waiting" | "completed";
export function sampleReport(id: SampleId): TraceReport {
  const waiting = id === "waiting",
    complete = id === "completed";
  return {
    version: 1,
    sample: true,
    observedAt: "2026-10-06T08:30:00.000Z",
    sourceChain: "ethereum",
    destinationChain: "base",
    environment: "mainnet",
    sourceHash: "0x" + "8b2f43ad".repeat(8),
    sourceBlock: "23456102",
    destinationHash: null,
    amount: "1250000000",
    recipient: "0x" + "a27c19e4".repeat(5),
    nonce: "0x" + "b49e21fc".repeat(8),
    forwarding: null,
    ...diagnose({
      source: "confirmed",
      attestation: waiting ? "waiting" : "ready",
      received: complete,
      expired: false,
    }),
    stages: [
      {
        id: "source",
        title: "Source burn",
        state: "complete",
        detail: "Burn confirmed on Ethereum",
        evidence: "Illustrative receipt · block 23,456,102",
      },
      {
        id: "attestation",
        title: "Circle attestation",
        state: waiting ? "waiting" : "complete",
        detail: waiting
          ? "Waiting for attestation"
          : "Signed attestation available",
        evidence: waiting
          ? "Illustrative Iris status: pending"
          : "Illustrative Iris status: complete",
      },
      {
        id: "destination",
        title: "Destination receipt",
        state: complete ? "complete" : "waiting",
        detail: complete
          ? "Message received on Base"
          : "No receipt on Base yet",
        evidence: `Illustrative usedNonces: ${complete ? "1" : "0"}`,
      },
    ],
    gaps: [
      "Simulated sample. Hashes, addresses, and evidence are illustrative; no blockchain requests are made.",
    ],
  };
}
