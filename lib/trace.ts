import {
  decodeEventLog,
  decodeFunctionResult,
  encodeFunctionData,
  parseAbi,
} from "viem";
import { z } from "zod";
import {
  diagnose,
  type Chain,
  type Environment,
  type Observations,
  type TraceReport,
} from "./model";

const hashPattern = /^0x[\da-fA-F]{64}$/;
const noncePattern = /^0x[\da-fA-F]{64}$/;
const decimal = z.string().regex(/^\d+$/);
const messageSchema = z
  .object({
    cctpVersion: z.number(),
    status: z.string(),
    attestation: z.string().nullable().optional(),
    eventNonce: z.string().optional(),
    decodedMessage: z
      .object({
        sourceDomain: z.string(),
        destinationDomain: z.string(),
        nonce: z.string(),
        sender: z.string(),
        recipient: z.string(),
        decodedMessageBody: z
          .object({
            amount: decimal,
            burnToken: z.string(),
            mintRecipient: z.string(),
            expirationBlock: decimal.optional(),
          })
          .passthrough()
          .nullable()
          .optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
    forwardState: z.string().optional(),
    forwardTxHash: z.string().optional(),
    destinationMintTxHash: z.string().optional(),
  })
  .passthrough();
const payloadSchema = z.object({
  sourceTxHash: z.string().optional(),
  messages: z.array(messageSchema).max(8),
});
export type CircleMessage = z.infer<typeof messageSchema>;
const sentAbi = parseAbi(["event MessageSent(bytes message)"]);
const receivedAbi = parseAbi([
  "event MessageReceived(address indexed caller, uint32 sourceDomain, bytes32 indexed nonce, bytes32 sender, uint32 indexed finalityThresholdExecuted, bytes messageBody)",
]);
const nonceAbi = parseAbi([
  "function usedNonces(bytes32 nonce) view returns (uint256)",
]);
const contracts = {
  mainnet: {
    messenger: "0x28b5a0e9c621a5badaa536219b3a228c8168cf5d",
    transmitter: "0x81d40f21f12a8f0e3252bccb954d722d4c464b64",
  },
  testnet: {
    messenger: "0x8fe6b999dc680ccfdd5bf7eb0974218be2542daa",
    transmitter: "0xe737e5cebeeba77efe34d4aa090756590b1ce275",
  },
};
const domain: Record<Chain, string> = { ethereum: "0", base: "6" };
const config = {
  mainnet: {
    ethereum: {
      rpc: "https://ethereum-rpc.publicnode.com",
      scan: "https://eth.blockscout.com",
      usdc: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    },
    base: {
      rpc: "https://mainnet.base.org",
      scan: "https://base.blockscout.com",
      usdc: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
    },
  },
  testnet: {
    ethereum: {
      rpc: "https://ethereum-sepolia-rpc.publicnode.com",
      scan: "https://eth-sepolia.blockscout.com",
      usdc: "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238",
    },
    base: {
      rpc: "https://sepolia.base.org",
      scan: "https://base-sepolia.blockscout.com",
      usdc: "0x036cbd53842c5426634e7929541ec2318f3dcf7e",
    },
  },
};
type Fetcher = typeof fetch;
type Log = { address: string; data: `0x${string}`; topics: `0x${string}`[] };
const hex = z.string().regex(/^0x[\da-fA-F]*$/);
const address = z.string().regex(/^0x[\da-fA-F]{40}$/);
const logSchema = z.object({
  address,
  data: hex,
  topics: z.array(z.string().regex(hashPattern)),
});
const receiptSchema = z.object({
  status: z.enum(["0x0", "0x1"]),
  blockNumber: z.string().regex(/^0x[\da-fA-F]+$/),
  logs: z.array(logSchema),
});
const indexedReceiptSchema = z.object({
  status: z.string(),
  block_number: z.number().int().nonnegative().nullable(),
});
const indexedLogsSchema = z.object({
  items: z.array(
    z.object({
      address: z.object({ hash: address }),
      data: hex,
      topics: z.array(z.string().regex(hashPattern).nullable()),
    }),
  ),
});
interface Receipt {
  status: "confirmed" | "failed" | "unknown";
  block: string | null;
  logs: Log[];
  evidence: string;
}
export class TraceError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
async function json(
  url: string,
  fetcher: Fetcher,
  init?: RequestInit,
): Promise<unknown> {
  const response = await fetcher(url, {
    ...init,
    headers: {
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0 BridgeTrace/1.0",
      ...init?.headers,
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok)
    throw new TraceError(
      response.status === 404
        ? "Not found"
        : `Data source returned HTTP ${response.status}`,
      response.status === 404 ? 404 : 502,
    );
  return response.json();
}
async function rpc(
  chain: Chain,
  env: Environment,
  method: string,
  params: unknown[],
  fetcher: Fetcher,
): Promise<unknown> {
  const override =
    process.env[
      `BRIDGETRACE_${env.toUpperCase()}_${chain.toUpperCase()}_RPC_URL`
    ];
  const data = z
    .object({ result: z.unknown().optional(), error: z.unknown().optional() })
    .parse(
      await json(override || config[env][chain].rpc, fetcher, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      }),
    );
  if (data.error || !("result" in data))
    throw new Error("RPC data unavailable");
  return data.result;
}
async function receipt(
  chain: Chain,
  env: Environment,
  hash: string,
  fetcher: Fetcher,
): Promise<Receipt> {
  try {
    const r = receiptSchema.parse(
      await rpc(chain, env, "eth_getTransactionReceipt", [hash], fetcher),
    );
    return {
      status: r.status === "0x1" ? "confirmed" : "failed",
      block: BigInt(r.blockNumber).toString(),
      logs: r.logs as Log[],
      evidence: "Public RPC transaction receipt",
    };
  } catch {}
  try {
    const base = config[env][chain].scan;
    const [rawReceipt, rawLogs] = await Promise.all([
      json(`${base}/api/v2/transactions/${hash}`, fetcher),
      json(`${base}/api/v2/transactions/${hash}/logs`, fetcher),
    ]);
    const r = indexedReceiptSchema.parse(rawReceipt),
      l = indexedLogsSchema.parse(rawLogs);
    // Indexer evidence is explicitly labeled. A missing receipt stays unknown.
    const status =
      r.status === "ok" && r.block_number != null
        ? "confirmed"
        : r.status === "error"
          ? "failed"
          : "unknown";
    const logs: Log[] = l.items.map((x) => ({
      address: x.address.hash,
      data: x.data as `0x${string}`,
      topics: x.topics.filter(
        (t): t is string => t !== null,
      ) as `0x${string}`[],
    }));
    return {
      status,
      block: r.block_number == null ? null : String(r.block_number),
      logs,
      evidence: "Blockscout indexed transaction receipt",
    };
  } catch {
    return {
      status: "unknown",
      block: null,
      logs: [],
      evidence: "Source receipt unavailable",
    };
  }
}
interface Burn {
  destination: string;
  amount: string;
  recipient: string;
  token: string;
}
function burns(r: Receipt, chain: Chain, env: Environment): Burn[] {
  const result: Burn[] = [];
  for (const log of r.logs) {
    if (log.address.toLowerCase() !== contracts[env].transmitter) continue;
    try {
      const decoded = decodeEventLog({
        abi: sentAbi,
        data: log.data,
        topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
      });
      const h = decoded.args.message.slice(2).toLowerCase();
      if (
        h.length < 752 ||
        BigInt("0x" + h.slice(0, 8)) !== BigInt(1) ||
        BigInt("0x" + h.slice(8, 16)).toString() !== domain[chain]
      )
        continue;
      const sender = "0x" + h.slice(88 + 24, 152);
      if (sender !== contracts[env].messenger) continue;
      const b = h.slice(296);
      result.push({
        destination: BigInt("0x" + h.slice(16, 24)).toString(),
        token: "0x" + b.slice(8 + 24, 72),
        recipient: "0x" + b.slice(72 + 24, 136),
        amount: BigInt("0x" + b.slice(136, 200)).toString(),
      });
    } catch {}
  }
  return result;
}
export function matchingBurn(b: Burn, message: CircleMessage): boolean {
  const d = message.decodedMessage,
    body = d?.decodedMessageBody;
  return (
    !!d &&
    !!body &&
    b.destination === d.destinationDomain &&
    b.amount === body.amount &&
    b.recipient === walletAddress(body.mintRecipient) &&
    b.token === walletAddress(body.burnToken)
  );
}
function walletAddress(value: string): string {
  return /^0x[\da-fA-F]{40}$/.test(value)
    ? value.toLowerCase()
    : /^0x0{24}[\da-fA-F]{40}$/.test(value)
      ? "0x" + value.slice(-40).toLowerCase()
      : "";
}
async function destinationEvidence(
  chain: Chain,
  env: Environment,
  nonce: string | null,
  hash: string | null,
  source: Chain,
  fetcher: Fetcher,
): Promise<{
  received: boolean | null;
  block: string | null;
  hash: string | null;
  evidence: string;
}> {
  let block: string | null = null,
    received: boolean | null = null;
  if (nonce && noncePattern.test(nonce) && BigInt(nonce) !== BigInt(0)) {
    try {
      const head = z
        .string()
        .regex(/^0x[\da-fA-F]+$/)
        .parse(await rpc(chain, env, "eth_blockNumber", [], fetcher));
      block = BigInt(head).toString();
      const result = hex.parse(
        await rpc(
          chain,
          env,
          "eth_call",
          [
            {
              to: contracts[env].transmitter,
              data: encodeFunctionData({
                abi: nonceAbi,
                functionName: "usedNonces",
                args: [nonce as `0x${string}`],
              }),
            },
            head,
          ],
          fetcher,
        ),
      );
      const used = decodeFunctionResult({
        abi: nonceAbi,
        functionName: "usedNonces",
        data: result as `0x${string}`,
      });
      if (used === BigInt(0) || used === BigInt(1))
        received = used === BigInt(1);
      if (received === true)
        return {
          received,
          block,
          hash: null,
          evidence: `RPC usedNonces = 1 · destination block ${block}`,
        };
    } catch {}
  }
  if (hash && hashPattern.test(hash) && nonce && BigInt(nonce) !== BigInt(0)) {
    const r = await receipt(chain, env, hash, fetcher);
    if (r.status === "confirmed")
      for (const log of r.logs) {
        if (log.address.toLowerCase() !== contracts[env].transmitter) continue;
        try {
          const d = decodeEventLog({
            abi: receivedAbi,
            data: log.data,
            topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
          });
          if (
            d.args.nonce.toLowerCase() === nonce.toLowerCase() &&
            d.args.sourceDomain.toString() === domain[source]
          )
            return {
              received: true,
              block: r.block,
              hash,
              evidence: `${r.evidence} · matching MessageReceived nonce`,
            };
        } catch {}
      }
  }
  return {
    received,
    block,
    hash: null,
    evidence:
      received === false
        ? `RPC usedNonces = 0 · destination block ${block}`
        : "Destination receipt could not be checked",
  };
}
export async function traceTransfer(
  hash: string,
  chain: Chain,
  env: Environment,
  fetcher: Fetcher = fetch,
): Promise<TraceReport[]> {
  if (!hashPattern.test(hash))
    throw new TraceError("Enter a valid 32-byte source transaction hash.");
  const destination: Chain = chain === "ethereum" ? "base" : "ethereum";
  const host =
    env === "testnet"
      ? "https://iris-api-sandbox.circle.com"
      : "https://iris-api.circle.com";
  const [source, circle] = await Promise.all([
    receipt(chain, env, hash, fetcher),
    json(
      `${host}/v2/messages/${domain[chain]}?transactionHash=${hash}`,
      fetcher,
    )
      .then((data) => ({ data, error: null as string | null }))
      .catch((e) => ({
        data: null,
        error:
          e instanceof TraceError && e.status === 404
            ? "Circle has not returned a message for this hash. It may still be confirming, or the network/environment may be wrong."
            : "Circle’s attestation service is unavailable. Try again later.",
      })),
  ]);
  const sourceBurns = burns(source, chain, env),
    supportedBurns = sourceBurns.filter(
      (b) =>
        b.destination === domain[destination] &&
        b.token === config[env][chain].usdc,
    );
  if (source.status === "confirmed" && !supportedBurns.length)
    throw new TraceError(
      "No supported CCTP V2 USDC burn was found in this transaction. Check the source chain and environment. Explorer log pagination may also limit this check.",
      422,
    );
  const parsed = circle.data ? payloadSchema.safeParse(circle.data) : null;
  const messages = parsed?.success ? parsed.data.messages : [];
  if (
    parsed?.success &&
    parsed.data.sourceTxHash &&
    parsed.data.sourceTxHash.toLowerCase() !== hash.toLowerCase()
  )
    throw new TraceError(
      "Circle returned evidence for a different source hash.",
      502,
    );
  const relevant = messages.filter(
    (m) =>
      m.cctpVersion === 2 &&
      m.decodedMessage?.sourceDomain === domain[chain] &&
      m.decodedMessage?.destinationDomain === domain[destination] &&
      walletAddress(m.decodedMessage.sender) === contracts[env].messenger &&
      walletAddress(m.decodedMessage.recipient) === contracts[env].messenger &&
      walletAddress(m.decodedMessage.decodedMessageBody?.burnToken || "") ===
        config[env][chain].usdc,
  );
  const undecodedPending = messages.every(
    (m) =>
      m.cctpVersion === 2 &&
      !m.decodedMessage &&
      ["pending", "pending_confirmations"].includes(m.status),
  );
  const unmatchedEvidence =
    messages.length > 0 && !relevant.length && !undecodedPending;
  // A pending API entry may not be decoded; source burns still provide the route.
  const inputs: sourcedMessage[] = relevant.length
    ? relevant.map((m) => ({
        message: m,
        burn: supportedBurns.find((b) => matchingBurn(b, m)) || null,
      }))
    : supportedBurns.map((b) => ({ message: null, burn: b }));
  if (!inputs.length) inputs.push({ message: null, burn: null });
  if (inputs.length > 8)
    throw new TraceError(
      "This transaction contains more than eight supported messages. Inspect it with the originating app.",
      422,
    );
  return Promise.all(
    inputs.map(async ({ message: m, burn }) => {
      const gaps: string[] = [];
      if (circle.error) gaps.push(circle.error);
      if (parsed && !parsed.success)
        gaps.push("Circle’s response did not match the supported schema.");
      if (unmatchedEvidence)
        gaps.push(
          "Circle returned decoded evidence for a different or unsupported route.",
        );
      if (source.status === "unknown")
        gaps.push("Source-chain receipt was unavailable.");
      const d = m?.decodedMessage,
        body = d?.decodedMessageBody;
      const rawNonce = d?.nonce || m?.eventNonce;
      const nonce =
        rawNonce &&
        noncePattern.test(rawNonce) &&
        BigInt(rawNonce) !== BigInt(0)
          ? rawNonce
          : null;
      const hint = m?.destinationMintTxHash || m?.forwardTxHash;
      const dest = await destinationEvidence(
        destination,
        env,
        nonce,
        hint && hashPattern.test(hint) ? hint : null,
        chain,
        fetcher,
      );
      const attestation: Observations["attestation"] =
        m?.status === "complete" &&
        m.attestation &&
        /^0x(?:[\da-fA-F]{130})+$/.test(m.attestation)
          ? "ready"
          : circle.error ||
              (parsed && !parsed.success) ||
              unmatchedEvidence ||
              (m && !["pending", "pending_confirmations"].includes(m.status))
            ? "unknown"
            : "waiting";
      // Before the API assigns a nonce, there is no destination mapping to read.
      const received = nonce
        ? dest.received
        : attestation === "waiting"
          ? false
          : null;
      if (nonce && dest.received === null)
        gaps.push("Destination RPC and receipt evidence were unavailable.");
      const expiration = body?.expirationBlock;
      const expired =
        expiration && expiration !== "0" && dest.block
          ? BigInt(expiration) <= BigInt(dest.block)
          : null;
      if (attestation === "ready" && !expiration && received !== true)
        gaps.push(
          "Circle did not return an expiration block for the attestation.",
        );
      if (
        attestation === "ready" &&
        expiration &&
        expiration !== "0" &&
        !dest.block
      )
        gaps.push(
          "Attestation expiry could not be compared with the destination block.",
        );
      const confirmed = source.status === "confirmed" && !!burn;
      if (m && !burn)
        gaps.push(
          "The decoded Circle message did not match an independently observed source burn.",
        );
      const observed: Observations = {
        source:
          source.status === "failed"
            ? "failed"
            : confirmed
              ? "confirmed"
              : "unknown",
        attestation,
        received,
        expired,
      };
      const summary = diagnose(observed);
      if (
        (!expiration || (expiration !== "0" && expired === null)) &&
        received !== true &&
        summary.outcome === "ready-to-receive"
      )
        Object.assign(summary, diagnose({ ...observed, received: null }));
      return {
        version: 1 as const,
        sample: false,
        observedAt: new Date().toISOString(),
        sourceChain: chain,
        destinationChain: destination,
        environment: env,
        sourceHash: hash,
        sourceBlock: source.block,
        destinationHash: dest.hash,
        amount: burn?.amount || body?.amount || null,
        recipient:
          burn?.recipient || walletAddress(body?.mintRecipient || "") || null,
        nonce,
        forwarding: m?.forwardState || null,
        ...summary,
        stages: [
          {
            id: "source" as const,
            title: "Source burn",
            state: confirmed
              ? ("complete" as const)
              : source.status === "failed"
                ? ("failed" as const)
                : ("unknown" as const),
            detail: confirmed
              ? "CCTP USDC burn confirmed"
              : source.status === "failed"
                ? "Transaction reverted"
                : "Burn not independently confirmed",
            evidence: `${source.evidence}${source.block ? " · block " + source.block : ""}`,
          },
          {
            id: "attestation" as const,
            title: "Circle attestation",
            state:
              expired && received !== true
                ? ("expired" as const)
                : attestation === "ready"
                  ? ("complete" as const)
                  : attestation === "waiting"
                    ? ("waiting" as const)
                    : ("unknown" as const),
            detail:
              expired && received !== true
                ? "Attestation expired"
                : attestation === "ready"
                  ? "Signed attestation available"
                  : attestation === "waiting"
                    ? "Attestation not yet returned"
                    : "Attestation unavailable",
            evidence: m
              ? `Iris status: ${m.status}`
              : circle.error || "No decoded message returned",
          },
          {
            id: "destination" as const,
            title: "Destination receipt",
            state:
              received === true
                ? ("complete" as const)
                : received === false
                  ? ("waiting" as const)
                  : ("unknown" as const),
            detail:
              received === true
                ? "Message received"
                : received === false
                  ? "No receipt observed yet"
                  : "Receipt status unknown",
            evidence: nonce
              ? dest.evidence
              : "Destination nonce has not been assigned",
          },
        ],
        gaps,
      };
    }),
  );
}
interface sourcedMessage {
  message: CircleMessage | null;
  burn: Burn | null;
}
