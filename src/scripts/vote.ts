// One-tap "which bank next?" vote. Sends ONLY the bank's name (from a fixed list) to our own
// Worker; never anything from a statement. Remembers locally which banks this browser voted for.
import { isRequestableBank } from "../data/banks.ts";

const VOTE_URL = "/api/vote";
const STORAGE_KEY = "w2e-bank-votes";

const status = document.getElementById("vote-status");
const fallback = document.getElementById("vote-fallback");
const fallbackLink = document.getElementById("vote-fallback-link") as HTMLAnchorElement | null;
const chips = document.querySelectorAll<HTMLButtonElement>(".bank-chip[data-bank]");

function voted(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
function remember(bank: string) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...new Set([...voted(), bank])]));
  } catch {
    /* private mode etc.: voting still works, it just isn't remembered */
  }
}
function markVoted(chip: HTMLButtonElement) {
  chip.setAttribute("aria-pressed", "true");
  chip.classList.add("is-voted");
}

for (const chip of chips) if (voted().includes(chip.dataset.bank ?? "")) markVoted(chip);

for (const chip of chips) {
  chip.addEventListener("click", async () => {
    const bank = chip.dataset.bank;
    if (!isRequestableBank(bank) || !status) return;
    if (chip.classList.contains("is-voted")) {
      status.textContent = `Thanks! ${bank} is already noted ✓`;
      return;
    }
    chip.disabled = true;
    if (fallback) fallback.hidden = true;
    try {
      const res = await fetch(VOTE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bank }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      markVoted(chip);
      remember(bank);
      status.textContent = `Thanks! ${bank} noted ✓`;
    } catch {
      // Offline, blocked, or a dev server without the Worker: offer email instead.
      status.textContent = "";
      if (fallback && fallbackLink) {
        const subject =
          bank === "Other" ? "Please add another bank or wallet" : `Please add ${bank}`;
        fallbackLink.href = `${fallbackLink.href.split("?")[0]}?subject=${encodeURIComponent(subject)}`;
        fallback.hidden = false;
      }
    } finally {
      chip.disabled = false;
    }
  });
}
