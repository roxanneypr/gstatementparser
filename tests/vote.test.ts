import { describe, expect, it } from "vitest";
import { handleTotals, handleVote, type VoteStore } from "../worker/vote.ts";

function fakeStore() {
  const added: string[] = [];
  const store: VoteStore = {
    add: async (bank) => void added.push(bank),
    totals: async () => [{ bank: "GoTyme", votes: added.filter((b) => b === "GoTyme").length }],
  };
  return { store, added };
}

const vote = (body: string, init: { origin?: string | null; method?: string } = {}) => {
  const headers = new Headers({ "Content-Type": "application/json" });
  const origin = init.origin === undefined ? "https://wallettoexcel.com" : init.origin;
  if (origin) headers.set("Origin", origin);
  return new Request("https://wallettoexcel.com/api/vote", {
    method: init.method ?? "POST",
    headers,
    body: init.method === "GET" ? undefined : body,
  });
};

describe("handleVote", () => {
  it("stores a known bank and nothing else", async () => {
    const { store, added } = fakeStore();
    const res = await handleVote(vote('{"bank":"GoTyme","name":"Juan","email":"x@y.z"}'), store);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(added).toEqual(["GoTyme"]); // only the bank name reaches storage
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("rejects unknown banks, bad JSON, big bodies and other methods", async () => {
    const { store, added } = fakeStore();
    expect((await handleVote(vote('{"bank":"Hackers Inc"}'), store)).status).toBe(400);
    expect((await handleVote(vote("not json"), store)).status).toBe(400);
    expect(
      (await handleVote(vote(`{"bank":"GoTyme","x":"${"a".repeat(300)}"}`), store)).status,
    ).toBe(413);
    expect((await handleVote(vote("", { method: "GET" }), store)).status).toBe(405);
    expect(added).toEqual([]);
  });

  it("only accepts votes from our own pages", async () => {
    const { store, added } = fakeStore();
    expect(
      (await handleVote(vote('{"bank":"SeaBank"}', { origin: "https://evil.example" }), store))
        .status,
    ).toBe(403);
    expect((await handleVote(vote('{"bank":"SeaBank"}', { origin: null }), store)).status).toBe(
      403,
    );
    expect(added).toEqual([]);
  });
});

describe("handleTotals", () => {
  it("is hidden unless the secret key is configured and given", async () => {
    const { store } = fakeStore();
    const req = (q: string) => new Request(`https://wallettoexcel.com/api/votes${q}`);
    expect((await handleTotals(req("?key=abc"), undefined, store)).status).toBe(404);
    expect((await handleTotals(req("?key=wrong"), "abc", store)).status).toBe(404);
    const ok = await handleTotals(req("?key=abc"), "abc", store);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ totals: [{ bank: "GoTyme", votes: 0 }] });
  });
});
