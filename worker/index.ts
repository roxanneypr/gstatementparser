// Cloudflare Worker for wallettoexcel.com.
// Static files (the whole site, including the converter) are served by the assets layer and never
// reach this code. Only /api/* runs here: the anonymous one-tap bank vote.
import { DurableObject } from "cloudflare:workers";
import type { RequestableBank } from "../src/data/banks.ts";
import { handleTotals, handleVote, type VoteStore } from "./vote.ts";

interface Env {
  ASSETS: Fetcher;
  VOTES: DurableObjectNamespace<VoteCounter>;
  /** Optional secret; when set, GET /api/votes?key=<VOTES_KEY> returns the totals. */
  VOTES_KEY?: string;
}

/** One SQLite-backed counter for all votes: (bank, day) -> count. Nothing else is stored. */
export class VoteCounter extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS votes (
         bank TEXT NOT NULL,
         day TEXT NOT NULL,
         count INTEGER NOT NULL DEFAULT 0,
         PRIMARY KEY (bank, day)
       )`,
    );
  }

  async add(bank: RequestableBank): Promise<void> {
    const day = new Date().toISOString().slice(0, 10);
    this.ctx.storage.sql.exec(
      `INSERT INTO votes (bank, day, count) VALUES (?, ?, 1)
       ON CONFLICT(bank, day) DO UPDATE SET count = count + 1`,
      bank,
      day,
    );
  }

  async totals(): Promise<{ bank: string; votes: number }[]> {
    return this.ctx.storage.sql
      .exec<{ bank: string; votes: number }>(
        "SELECT bank, SUM(count) AS votes FROM votes GROUP BY bank ORDER BY votes DESC",
      )
      .toArray();
  }
}

function store(env: Env): VoteStore {
  const counter = env.VOTES.get(env.VOTES.idFromName("all"));
  return { add: (bank) => counter.add(bank), totals: () => counter.totals() };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/vote") return handleVote(request, store(env));
    if (pathname === "/api/votes") return handleTotals(request, env.VOTES_KEY, store(env));
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
