import { traceTransfer, TraceError } from "../../../lib/trace";
export const dynamic = "force-dynamic";
const cache = new Map<string, { at: number; data: unknown }>();
const active = new Map<string, Promise<unknown>>();
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams,
    hash = q.get("hash") || "",
    chain = q.get("chain") || "ethereum",
    env = q.get("environment") || "mainnet";
  if (
    !/^0x[\da-fA-F]{64}$/.test(hash) ||
    !["ethereum", "base"].includes(chain) ||
    !["mainnet", "testnet"].includes(env)
  )
    return Response.json(
      {
        error:
          "Use a valid source transaction hash, Ethereum or Base, and mainnet or testnet.",
      },
      { status: 400 },
    );
  const key = `${env}:${chain}:${hash.toLowerCase()}`,
    cached = cache.get(key);
  if (cached && Date.now() - cached.at < 30000)
    return Response.json(cached.data, {
      headers: { "Cache-Control": "no-store" },
    });
  if (active.size >= 12 && !active.has(key))
    return Response.json(
      { error: "The service is busy. Please retry shortly." },
      { status: 429, headers: { "Retry-After": "10" } },
    );
  try {
    let promise = active.get(key);
    if (!promise) {
      promise = traceTransfer(
        hash,
        chain as "ethereum" | "base",
        env as "mainnet" | "testnet",
      ).then((reports) => ({ reports }));
      active.set(key, promise);
    }
    const data = await promise;
    if (cache.size >= 128) cache.delete(cache.keys().next().value!);
    cache.set(key, { at: Date.now(), data });
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof TraceError
            ? e.message
            : "Evidence lookup could not be completed. Please retry.",
      },
      { status: e instanceof TraceError ? e.status : 502 },
    );
  } finally {
    active.delete(key);
  }
}
