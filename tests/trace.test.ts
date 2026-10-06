import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { encodeAbiParameters, encodeEventTopics, padHex, parseAbi } from "viem";
import { traceTransfer, TraceError } from "../lib/trace";

// Captured public Circle response; RPC receipts below are deterministic test doubles.
const fixture = JSON.parse(
  readFileSync(
    new URL("./fixtures/circle-completed-testnet.json", import.meta.url),
    "utf8",
  ),
);
const sourceHash = fixture.sourceTxHash;
const transmitter = "0xe737e5cebeeba77efe34d4aa090756590b1ce275";
const abi = parseAbi([
  "event MessageSent(bytes message)",
  "event MessageReceived(address indexed caller, uint32 sourceDomain, bytes32 indexed nonce, bytes32 sender, uint32 indexed finalityThresholdExecuted, bytes messageBody)",
]);
const zero = "0x" + "0".repeat(64);
type Options = {
  used?: number | null;
  head?: number;
  circleStatus?: number;
  sourceStatus?: string;
  noBurn?: boolean;
  fallback?: boolean;
  wrongReceipt?: boolean;
};
function transport(payload = structuredClone(fixture), options: Options = {}) {
  const calls: string[] = [];
  const bytes = fixture.messages[0].message as `0x${string}`;
  // Source MessageSent has a placeholder nonce. Circle assigns the actual nonce later.
  const message = (bytes.slice(0, 26) +
    "0".repeat(64) +
    bytes.slice(90)) as `0x${string}`;
  const sourceLog = {
    address: transmitter,
    data: encodeAbiParameters([{ type: "bytes" }], [message]),
    topics: encodeEventTopics({ abi, eventName: "MessageSent" }),
  };
  const destinationLog = {
    address: transmitter,
    data: encodeAbiParameters(
      [{ type: "uint32" }, { type: "bytes32" }, { type: "bytes" }],
      [
        6,
        padHex(fixture.messages[0].decodedMessage.sender, { size: 32 }),
        "0x",
      ],
    ),
    topics: encodeEventTopics({
      abi,
      eventName: "MessageReceived",
      args: {
        caller: ("0x" + "1".repeat(40)) as `0x${string}`,
        nonce: options.wrongReceipt
          ? zero
          : fixture.messages[0].decodedMessage.nonce,
        finalityThresholdExecuted: 2000,
      },
    }),
  };
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    if (url.includes("iris-api"))
      return Response.json(payload, { status: options.circleStatus || 200 });
    if (body) {
      calls.push(body.method);
      if (body.method === "eth_getTransactionReceipt") {
        if (options.fallback && body.params[0] !== sourceHash)
          return Response.json({ error: { message: "unavailable" } });
        return Response.json({
          result: {
            status: options.sourceStatus || "0x1",
            blockNumber: "0x100",
            logs: options.noBurn ? [] : [sourceLog],
          },
        });
      }
      if (body.method === "eth_blockNumber")
        return Response.json({
          result: "0x" + (options.head ?? 100).toString(16),
        });
      if (body.method === "eth_call")
        return Response.json(
          options.fallback || options.used === null
            ? { error: { message: "unavailable" } }
            : {
                result: encodeAbiParameters(
                  [{ type: "uint256" }],
                  [BigInt(options.used ?? 0)],
                ),
              },
        );
    }
    if (options.fallback && url.includes("eth-sepolia.blockscout.com")) {
      if (url.endsWith("/logs"))
        return Response.json({
          items: [{ ...destinationLog, address: { hash: transmitter } }],
        });
      return Response.json({ status: "ok", block_number: 99 });
    }
    return Response.json({ error: "unavailable" }, { status: 502 });
  };
  return { fetcher, calls };
}
async function lookup(
  payload = structuredClone(fixture),
  options: Options = {},
) {
  const { fetcher } = transport(payload, options);
  return (await traceTransfer(sourceHash, "base", "testnet", fetcher))[0];
}
test("Circle complete + unused nonce means receipt pending", async () => {
  const r = await lookup();
  assert.equal(r.outcome, "ready-to-receive");
  assert.equal(r.amount, "15000000");
  assert.equal(r.sample, false);
});
test("usedNonces=1 independently confirms delivery", async () => {
  assert.equal((await lookup(undefined, { used: 1 })).outcome, "completed");
});
test("expiry is inclusive at the destination block", async () => {
  const p = structuredClone(fixture);
  p.messages[0].decodedMessage.decodedMessageBody.expirationBlock = "100";
  assert.equal((await lookup(p, { head: 100 })).outcome, "expired");
  assert.equal((await lookup(p, { head: 99 })).outcome, "ready-to-receive");
  assert.equal((await lookup(p, { head: 101, used: 1 })).outcome, "completed");
});
test("provider failure never implies receipt pending or delivered", async () => {
  const r = await lookup(undefined, { used: null });
  assert.equal(r.outcome, "unknown");
  assert.ok(r.gaps.length);
});
test("Circle 404 is missing evidence, not proof of loss", async () => {
  assert.equal(
    (await lookup(undefined, { circleStatus: 404 })).outcome,
    "unknown",
  );
});
test("pending undecoded API entries use confirmed source burns", async () => {
  const p = {
    sourceTxHash: sourceHash,
    messages: [
      {
        cctpVersion: 2,
        status: "pending_confirmations",
        attestation: "PENDING",
        decodedMessage: null,
      },
    ],
  };
  assert.equal((await lookup(p)).outcome, "waiting-attestation");
});
test("a mismatched amount cannot be used to confirm a source burn", async () => {
  const p = structuredClone(fixture);
  p.messages[0].decodedMessage.decodedMessageBody.amount = "42";
  assert.equal((await lookup(p, { used: 1 })).outcome, "unknown");
});
test("unsupported decoded route stays unknown", async () => {
  const p = structuredClone(fixture);
  p.messages[0].decodedMessage.destinationDomain = "3";
  assert.equal((await lookup(p, { used: 1 })).outcome, "unknown");
});
test("reserved zero nonce is never checked as a real message", async () => {
  const p = structuredClone(fixture);
  p.messages[0].decodedMessage.nonce = zero;
  p.messages[0].eventNonce = zero;
  const { fetcher, calls } = transport(p, { used: 1 });
  const r = (await traceTransfer(sourceHash, "base", "testnet", fetcher))[0];
  assert.equal(r.outcome, "unknown");
  assert.ok(!calls.includes("eth_call"));
});
test("matching MessageReceived fallback independently confirms a destination hash", async () => {
  const r = await lookup(undefined, { fallback: true });
  assert.equal(r.outcome, "completed");
  assert.equal(r.destinationHash, fixture.messages[0].destinationMintTxHash);
});
test("a hinted destination tx without a matching nonce is not delivery evidence", async () => {
  assert.equal(
    (await lookup(undefined, { fallback: true, wrongReceipt: true })).outcome,
    "unknown",
  );
});
test("malformed provider data is treated as unknown", async () => {
  assert.equal(
    (await lookup(undefined, { sourceStatus: "garbage" })).outcome,
    "unknown",
  );
  assert.equal((await lookup({ messages: "bad" })).outcome, "unknown");
});
test("a reverted source stays failed", async () => {
  assert.equal(
    (await lookup(undefined, { sourceStatus: "0x0", noBurn: true })).outcome,
    "source-failed",
  );
});
test("non-CCTP transactions and invalid hashes return useful input errors", async () => {
  await assert.rejects(
    () => lookup(undefined, { noBurn: true }),
    (e: unknown) => e instanceof TraceError && e.status === 422,
  );
  await assert.rejects(
    () => traceTransfer("bad", "base", "testnet"),
    (e: unknown) => e instanceof TraceError && e.status === 400,
  );
});
test("missing expiration data cannot imply an attestation is still valid", async () => {
  const p = structuredClone(fixture);
  delete p.messages[0].decodedMessage.decodedMessageBody.expirationBlock;
  assert.equal((await lookup(p)).outcome, "unknown");
});
