export type Chain = "ethereum" | "base";
export type Environment = "mainnet" | "testnet";
export type StageState =
  | "complete"
  | "waiting"
  | "unknown"
  | "expired"
  | "failed";
export type Outcome =
  | "completed"
  | "waiting-attestation"
  | "ready-to-receive"
  | "expired"
  | "unknown"
  | "source-failed";
export interface Stage {
  id: "source" | "attestation" | "destination";
  title: string;
  state: StageState;
  detail: string;
  evidence?: string;
}
export interface TraceReport {
  version: 1;
  sample: boolean;
  observedAt: string;
  sourceChain: Chain;
  destinationChain: Chain;
  environment: Environment;
  sourceHash: string;
  sourceBlock: string | null;
  destinationHash: string | null;
  amount: string | null;
  recipient: string | null;
  nonce: string | null;
  forwarding: string | null;
  outcome: Outcome;
  headline: string;
  explanation: string;
  nextAction: string;
  stages: Stage[];
  gaps: string[];
}
export const chainName = (chain: Chain, env: Environment = "mainnet") =>
  chain === "ethereum"
    ? env === "testnet"
      ? "Sepolia"
      : "Ethereum"
    : env === "testnet"
      ? "Base Sepolia"
      : "Base";
export const explorer = (chain: Chain, env: Environment = "mainnet") =>
  chain === "ethereum"
    ? env === "testnet"
      ? "https://sepolia.etherscan.io"
      : "https://etherscan.io"
    : env === "testnet"
      ? "https://sepolia.basescan.org"
      : "https://basescan.org";
export const shorten = (value: string) =>
  value.length > 22 ? `${value.slice(0, 10)}…${value.slice(-8)}` : value;
export function usdcAmount(raw: string | null): string {
  if (!raw || !/^\d+$/.test(raw)) return "Unknown";
  const n = BigInt(raw),
    whole = (n / BigInt(1000000)).toString(),
    fraction = (n % BigInt(1000000))
      .toString()
      .padStart(6, "0")
      .replace(/0+$/, "");
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${fraction ? "." + fraction : ""}`;
}
export interface Observations {
  source: "confirmed" | "failed" | "unknown";
  attestation: "ready" | "waiting" | "unknown";
  received: boolean | null;
  expired: boolean | null;
}
export function diagnose(
  o: Observations,
): Pick<TraceReport, "outcome" | "headline" | "explanation" | "nextAction"> {
  if (o.source === "failed")
    return {
      outcome: "source-failed",
      headline: "Source transaction reverted",
      explanation:
        "The source transaction did not complete successfully. It is not evidence of a completed burn.",
      nextAction:
        "Review the source transaction error with the app that submitted it.",
    };
  if (o.source !== "confirmed")
    return {
      outcome: "unknown",
      headline: "Source evidence is incomplete",
      explanation:
        "The source burn could not be independently confirmed. No conclusion about delivery is available.",
      nextAction:
        "Check the source network and transaction hash, then refresh the evidence.",
    };
  if (o.received === true)
    return {
      outcome: "completed",
      headline: "Destination received the message",
      explanation:
        "Destination-chain evidence confirms that MessageTransmitter processed this message nonce successfully.",
      nextAction:
        "Check the recipient’s destination-chain USDC balance and the originating app’s receipt. CCTP fees can reduce the amount received.",
    };
  if (o.attestation === "unknown" || o.received === null)
    return {
      outcome: "unknown",
      headline: "Some evidence is unavailable",
      explanation:
        "A data source did not return enough evidence to determine the transfer’s current stage.",
      nextAction:
        "Refresh after the data source recovers. Missing data does not mean your funds were lost.",
    };
  if (o.expired === true)
    return {
      outcome: "expired",
      headline: "The attestation needs renewal",
      explanation:
        "The attestation has expired at the destination block. No destination receipt was observed.",
      nextAction:
        "Ask the originating app or relayer to request a fresh attestation through Circle’s re-attestation flow.",
    };
  if (o.attestation === "waiting")
    return {
      outcome: "waiting-attestation",
      headline: "Waiting for Circle’s attestation",
      explanation:
        "The source burn is confirmed. Circle has not returned a ready attestation for this message yet.",
      nextAction:
        "Wait for source-chain finality and check again. Contact the originating app for persistent delays.",
    };
  return {
    outcome: "ready-to-receive",
    headline: "Attested. Destination receipt pending.",
    explanation:
      "Circle has returned an attestation, but the destination nonce is still unused. The message has not been received on the destination chain.",
    nextAction:
      "Check the originating app or relayer’s destination submission. An attestation alone does not submit the receive transaction.",
  };
}
