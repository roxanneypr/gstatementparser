// Banks/wallets people can request on the home page ("Which one should we add next?").
// Shared by the page and the Worker so only these values can ever be stored.
export const REQUESTABLE_BANKS = ["GoTyme", "BPI", "BDO", "SeaBank", "UnionBank", "Other"] as const;
export type RequestableBank = (typeof REQUESTABLE_BANKS)[number];

export const isRequestableBank = (v: unknown): v is RequestableBank =>
  typeof v === "string" && (REQUESTABLE_BANKS as readonly string[]).includes(v);
