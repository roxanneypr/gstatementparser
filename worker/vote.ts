// Request handling for the one-tap bank vote. Plain Fetch API types only, so it is unit-tested in
// Node; the Durable Object storage lives in worker/index.ts.
//
// Privacy: the only thing ever stored is the bank name (from a fixed list) and the date. No IP
// address, user agent, cookie or statement data is read or kept.
import { isRequestableBank, type RequestableBank } from "../src/data/banks.ts";

export interface VoteStore {
  add(bank: RequestableBank): Promise<void>;
  totals(): Promise<{ bank: string; votes: number }[]>;
}

const MAX_BODY = 200;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });

/** POST /api/vote  {"bank":"Maya"} -> 200 {"ok":true} */
export async function handleVote(request: Request, store: VoteStore): Promise<Response> {
  if (request.method !== "POST") return json(405, { error: "method_not_allowed" });

  // Only accept votes sent by our own pages.
  const origin = request.headers.get("Origin");
  if (!origin || origin !== new URL(request.url).origin) return json(403, { error: "forbidden" });

  const length = Number(request.headers.get("Content-Length") ?? "0");
  if (length > MAX_BODY) return json(413, { error: "too_large" });
  const text = await request.text();
  if (text.length > MAX_BODY) return json(413, { error: "too_large" });

  let bank: unknown;
  try {
    bank = (JSON.parse(text) as { bank?: unknown }).bank;
  } catch {
    return json(400, { error: "bad_request" });
  }
  if (!isRequestableBank(bank)) return json(400, { error: "unknown_bank" });

  await store.add(bank);
  return json(200, { ok: true });
}

/** GET /api/votes?key=…  -> totals per bank. Only works when the VOTES_KEY secret is set. */
export async function handleTotals(
  request: Request,
  key: string | undefined,
  store: VoteStore,
): Promise<Response> {
  const given = new URL(request.url).searchParams.get("key");
  if (!key || !given || given !== key) return json(404, { error: "not_found" });
  return json(200, { totals: await store.totals() });
}
