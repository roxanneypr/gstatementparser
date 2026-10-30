// Converter UI wiring. Everything runs in the browser: the PDF, its password and the parsed
// transactions are never sent over the network. Heavy libraries (pdf.js, SheetJS) load lazily.
import { formatPeriod } from "../lib/dates.ts";
import { formatMoney } from "../lib/money.ts";
import { cleanUp, countUnchanged } from "../lib/cleanUp.ts";
import {
  CATEGORIES,
  categorize,
  categoryKey,
  isCategory,
  type Category,
} from "../lib/categories.ts";
import { combine } from "../lib/combine.ts";
import { exportBaseName, isCombined, summarize, type Summary } from "../lib/summary.ts";
import {
  filterCounts,
  filterTransactions,
  needsReview,
  pageButtons,
  paginate,
  type IndexedTx,
  type TxFilter,
  type TxQuery,
} from "../lib/txView.ts";
import type { ParseResult, Transaction, Workbook } from "../parsers/types.ts";
import { fill, plural, strings } from "../site.ts";

const t = strings.en.converter;
const r = t.results;
const MAX_BYTES = 25 * 1024 * 1024;

const el = <T extends HTMLElement>(id: string) => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`#${id} missing`);
  return node as T;
};

type State = "idle" | "password" | "working" | "done";

const panel = el<HTMLDivElement>("panel");
const fileInput = el<HTMLInputElement>("pdf-file");
const chooseBtn = el<HTMLButtonElement>("choose-btn");
const passwordForm = el<HTMLFormElement>("state-password");
const passwordInput = el<HTMLInputElement>("pdf-password");
const togglePassword = el<HTMLButtonElement>("toggle-password");
const passwordBack = el<HTMLButtonElement>("password-back");
const statusEl = el<HTMLParagraphElement>("status");
const errorEl = el<HTMLParagraphElement>("error");
const results = el<HTMLDivElement>("results");
const states: Record<State, HTMLElement> = {
  idle: el("state-idle"),
  password: passwordForm,
  working: el("state-working"),
  done: el("state-done"),
};

/** Free for now; this one number is where a paid tier would set its own limit. */
const MAX_STATEMENTS = 24;
const MAX_BATCH_BYTES = 150 * 1024 * 1024;

/** A statement read in this session, exactly as parsed. */
interface Loaded {
  label: string;
  parsed: ParseResult;
}

/** Statements read so far; `result` is them combined, cleaned up (maybe) and categorized. */
let loaded: Loaded[] = [];
let result: Workbook | null = null;
/** Files still to read in this batch, the one being read, and its position for "File 2 of 3". */
let queue: File[] = [];
let file: File | null = null;
let batch = { index: 0, total: 0 };
/** How many statements were loaded before this batch (to announce how many it added). */
let loadedBefore = 0;
/** Problems with individual files in this batch ("name.pdf: not a PDF"), shown when it ends. */
let problems: string[] = [];
/** The last password that opened a file in this batch: tried first on the next file (several
 *  statements from one account share a password). In memory only; forgotten when the batch ends. */
let batchPassword: string | null = null;
/** Categories the user changed, by categoryKey(description). In memory only, never stored. */
const categoryOverrides = new Map<string, Category>();

/** Rebuild `result` from the loaded statements with the current clean-up, duplicates and categories. */
function recompute() {
  if (!loaded.length) {
    result = null;
    return;
  }
  const inputs = loaded.map(({ label, parsed }) => ({
    label,
    result: cleanupToggle.checked ? cleanUp(parsed) : parsed,
  }));
  result = categorize(combine(inputs, { keepDuplicates: !dupesToggle.checked }), categoryOverrides);
}

const peso = (centavos: number) =>
  centavos < 0 ? `−₱${formatMoney(-centavos)}` : `₱${formatMoney(centavos)}`;

// ---- panel state ------------------------------------------------------------

function setState(state: State) {
  panel.dataset.state = state;
  for (const [name, node] of Object.entries(states)) node.hidden = name !== state;
  const working =
    batch.total > 1 ? fill(t.convertingMany, { i: batch.index, n: batch.total }) : t.converting;
  statusEl.textContent = state === "working" ? working : "";
  const workingText = states.working.querySelector("p");
  if (workingText) workingText.textContent = working;
  for (const n of panel.querySelectorAll(".file-name")) n.textContent = file?.name ?? "";
}

function showError(message: string) {
  errorEl.textContent = message;
}

function reset() {
  loaded = [];
  queue = [];
  file = null;
  result = null;
  problems = [];
  batch = { index: 0, total: 0 };
  batchPassword = null;
  categoryOverrides.clear();
  setCleanup(false);
  dupesToggle.checked = true;
  fileInput.value = "";
  passwordInput.value = "";
  setPasswordVisible(false);
  showError("");
  results.hidden = true;
  setState("idle");
  chooseBtn.focus();
}

for (const btn of panel.querySelectorAll<HTMLButtonElement>('[data-action="reset"]')) {
  btn.addEventListener("click", reset);
}

// ---- choosing files -----------------------------------------------------------

chooseBtn.addEventListener("click", () => fileInput.click());
el("add-statement").addEventListener("click", () => fileInput.click());

// Header "Convert PDF" on this page: bring the converter into view without reloading, and put
// focus on whatever the next step is (choose a file, enter the password, or download).
for (const link of document.querySelectorAll<HTMLAnchorElement>('a.nav-cta[href="#convert"]')) {
  link.addEventListener("click", (e) => {
    e.preventDefault();
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    panel.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
    const state = panel.dataset.state;
    const target =
      state === "password" ? passwordInput : state === "done" ? el("done-title") : chooseBtn;
    target.focus({ preventScroll: true });
  });
}

// "Try a sample statement": loads a FAKE statement shipped with the site (same-origin GET,
// no user data involved) and runs it through the exact same converter.
// Each landing page picks its sample (GCash on the home page, the others on their own pages), but only
// from this fixed list of the site's own files.
const SAMPLE_URLS = [
  "/sample/sample-gcash-statement.pdf",
  "/sample/sample-maya-statement.pdf",
  "/sample/sample-bpi-statement.pdf",
  "/sample/sample-bdo-statement.pdf",
];
const sampleBtn = el<HTMLButtonElement>("sample-btn");
const SAMPLE_URL =
  SAMPLE_URLS.find((u) => u === sampleBtn.dataset.sampleUrl) ??
  "/sample/sample-gcash-statement.pdf";
sampleBtn.addEventListener("click", async () => {
  showError("");
  setState("working");
  try {
    const res = await fetch(SAMPLE_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const name = SAMPLE_URL.split("/").pop() ?? "sample-statement.pdf";
    start([new File([blob], name, { type: "application/pdf" })]);
  } catch (err) {
    console.error("Sample failed to load:", err);
    setState("idle");
    showError(t.errors.sampleFailed);
  }
});
fileInput.addEventListener("change", () => {
  const files = [...(fileInput.files ?? [])];
  fileInput.value = ""; // so choosing the same file again still fires "change"
  if (files.length) start(files);
});

// Don't let a PDF dropped outside the panel open in the tab.
for (const type of ["dragover", "drop"] as const) {
  window.addEventListener(type, (e) => e.preventDefault());
}
const canDrop = () => panel.dataset.state === "idle" || panel.dataset.state === "done";
panel.addEventListener("dragover", (e) => {
  e.preventDefault();
  if (canDrop()) panel.classList.add("dragging");
});
panel.addEventListener("dragleave", () => panel.classList.remove("dragging"));
panel.addEventListener("drop", (e) => {
  e.preventDefault();
  panel.classList.remove("dragging");
  const dropped = [...(e.dataTransfer?.files ?? [])];
  if (dropped.length && canDrop()) start(dropped);
});

/** Queue the chosen files (checked first) and read them one by one. */
function start(files: File[]) {
  showError("");
  problems = [];
  const single = files.length === 1 && !loaded.length;
  const problem = (f: File, message: string) =>
    problems.push(single ? message : fill(t.errors.fileProblem, { name: f.name, message }));
  const accepted: File[] = [];
  let bytes = 0;
  for (const f of files) {
    if (f.type !== "application/pdf" && !/\.pdf$/i.test(f.name)) problem(f, t.errors.notPdf);
    else if (f.size > MAX_BYTES || bytes + f.size > MAX_BATCH_BYTES) problem(f, t.errors.tooLarge);
    else {
      accepted.push(f);
      bytes += f.size;
    }
  }
  const room = MAX_STATEMENTS - loaded.length;
  if (accepted.length > room) {
    accepted.length = Math.max(0, room);
    problems.push(fill(t.errors.tooMany, { max: MAX_STATEMENTS }));
  }
  if (!accepted.length) return showError(problems.join(" "));
  queue = accepted;
  loadedBefore = loaded.length;
  batch = { index: 0, total: accepted.length };
  batchPassword = null;
  void next();
}

/** Read the next queued file, or show the results when the batch is done. */
function next(): Promise<void> | void {
  file = queue.shift() ?? null;
  if (!file) return finish();
  batch.index++;
  // Try the password that opened the previous file first; ask only if it doesn't fit.
  return convert(batchPassword ?? undefined, { remembered: batchPassword !== null });
}

// ---- password -----------------------------------------------------------------

function setPasswordVisible(show: boolean) {
  passwordInput.type = show ? "text" : "password";
  togglePassword.textContent = show ? t.hidePassword : t.showPassword;
  togglePassword.setAttribute("aria-pressed", String(show));
}

togglePassword.addEventListener("click", () =>
  setPasswordVisible(passwordInput.type === "password"),
);

passwordForm.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!passwordInput.value) {
    showError(t.errors.passwordEmpty);
    passwordInput.focus();
    return;
  }
  void convert(passwordInput.value);
});

/** Several files (or results already shown): skip this one. Otherwise: start over. */
const canSkip = () => batch.total > 1 || loaded.length > 0;
passwordBack.addEventListener("click", () => {
  if (!canSkip()) return reset();
  passwordInput.value = "";
  void next();
});

function askForPassword(message = "") {
  setState("password");
  el("file-of").textContent =
    batch.total > 1 ? fill(t.fileOf, { i: batch.index, n: batch.total }) : "";
  passwordBack.textContent = canSkip() ? t.skipFile : t.chooseDifferent;
  showError(message);
  passwordInput.focus();
  passwordInput.select();
}

// ---- convert --------------------------------------------------------------------

/** Label for a statement in lists, filters and exports, e.g. "GCash · Mar 1 – Mar 31, 2026". */
function statementLabel(parsed: ParseResult, name: string): string {
  const what =
    parsed.periodStart && parsed.periodEnd
      ? formatPeriod(parsed.periodStart, parsed.periodEnd)
      : name;
  const base = `${t.sources[parsed.source]} · ${what}`;
  let label = base;
  for (let n = 2; loaded.some((l) => l.label === label); n++) label = `${base} (${n})`;
  return label;
}

async function convert(password?: string, { remembered = false } = {}) {
  if (!file) return;
  showError("");
  setState("working");
  let modules;
  try {
    modules = await Promise.all([import("../pdf/extractText.ts"), import("../parsers/index.ts")]);
  } catch (err) {
    console.error("Converter modules failed to load:", err);
    return fileFailed(t.errors.loadFailed);
  }
  const [{ extractText, ExtractError }, { parseStatement }] = modules;
  try {
    let pages;
    try {
      pages = await extractText(await file.arrayBuffer(), password);
    } catch (err) {
      if (err instanceof ExtractError) {
        if (err.kind === "password-required") return askForPassword();
        // A remembered password that doesn't fit this file isn't the user's mistake: just ask.
        if (err.kind === "wrong-password") {
          return askForPassword(remembered ? "" : t.errors.wrongPassword);
        }
        return fileFailed(t.errors.invalidPdf);
      }
      throw err;
    }
    if (!pages.some((p) => p.items.length)) return fileFailed(t.errors.noText);
    const parsed = parseStatement(pages);
    if (!parsed) return fileFailed(t.errors.unsupported);

    if (password) batchPassword = password;
    passwordInput.value = ""; // don't keep the typed password in the field once it's been used
    loaded.push({ label: statementLabel(parsed, file.name), parsed });
    return next();
  } catch (err) {
    // Log the error only (never file contents) so problems can be diagnosed locally.
    console.error("Conversion failed:", err);
    return fileFailed(t.errors.generic);
  }
}

/** This file couldn't be read: note it and carry on with the rest of the batch. */
function fileFailed(message: string) {
  const single = batch.total === 1 && !loaded.length;
  problems.push(single ? message : fill(t.errors.fileProblem, { name: file?.name ?? "", message }));
  return next();
}

/** Batch finished: show the combined results (or the problems, if nothing could be read). */
function finish() {
  const added = loaded.length - loadedBefore;
  file = null;
  queue = [];
  batchPassword = null; // forget the password once the batch is done
  passwordInput.value = "";
  batch = { index: 0, total: 0 };
  if (!loaded.length) {
    setState("idle");
    showError(problems.join(" "));
    return;
  }
  const wasShowing = !results.hidden;
  recompute();
  if (!result) return;
  el("cleanup").hidden = loaded.reduce((n, l) => n + countUnchanged(l.parsed), 0) === 0;
  render(result, { keepView: false });
  setState("done");
  showError(problems.join(" "));
  if (wasShowing && added > 0) statusEl.textContent = plural(t.statements.added, added);
  el("done-title").focus();
  void import("../export/toXlsx.ts"); // warm up so the download is instant
}

// ---- results ----------------------------------------------------------------

// 50 rows per page on wide screens (fewer clicks), 20 on phones and tablets (short pages).
const wideScreen = matchMedia("(min-width: 1024px)");
const currentPageSize = () => (wideScreen.matches ? 50 : 20);
let pageSize = currentPageSize();
const ALL_VIEW = {
  filter: "all",
  month: "",
  category: "",
  statement: "",
  search: "",
  page: 1,
} as const;
let view: TxQuery & { page: number; category: string; statement: string } = { ...ALL_VIEW };

const signed = (centavos: number) => (centavos > 0 ? `+${peso(centavos)}` : peso(centavos));
const monthName = (ym: string) =>
  new Date(`${ym}-01T00:00:00Z`).toLocaleDateString("en-PH", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

/** Create an element with optional class and text. */
function h<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function render(res: Workbook, { keepView = false, keepPage = false } = {}) {
  const s = summarize(res);
  const period =
    res.periodStart && res.periodEnd ? formatPeriod(res.periodStart, res.periodEnd) : "";
  el("results-period").textContent = period;
  const combined = isCombined(res);
  const template = combined ? t.doneSummaryMany : s.count === 1 ? t.doneSummaryOne : t.doneSummary;
  el("done-summary").textContent = fill(template, {
    source: t.sources[res.source],
    count: res.statements.length,
    period,
    n: s.count,
  })
    .replace(" ·  · ", " · ")
    .trim();
  el("view-all-text").textContent = plural(r.viewAll, s.count);
  renderStatus(res);

  if (keepView) {
    if (!keepPage) view.page = 1;
  } else {
    view = { ...ALL_VIEW };
    el<HTMLInputElement>("tx-search").value = "";
  }

  renderStatements(res);
  renderOverview(res, s);
  renderReview(res);
  renderMonths(s);
  renderCategories(s);
  renderTable();
  results.hidden = false;
}

/** The statements behind the results, each with a Remove button (only when there are several). */
function renderStatements(res: Workbook) {
  const st = t.statements;
  const combined = isCombined(res);
  el("statements").hidden = !combined;
  el("dupes").hidden = res.duplicates.found === 0;
  const select = el<HTMLSelectElement>("statement-filter");
  select.hidden = !combined;
  select.replaceChildren(new Option(r.table.allStatements, ""));
  res.statements.forEach((s, i) => select.append(new Option(s.label, String(i))));
  if (view.statement && !res.statements[Number(view.statement)]) view.statement = "";
  if (!combined) return;
  el("statement-list").replaceChildren(
    ...res.statements.map((s) => {
      const li = h("li");
      const text = h("span", "statement-text");
      const count = s.result.transactions.length - (res.duplicates.removed ? s.duplicates : 0);
      const details = [plural(st.rows, count)];
      if (res.duplicates.removed && s.duplicates) details.push(plural(st.duplicates, s.duplicates));
      text.append(
        h("span", "statement-label", s.label),
        h("span", "statement-meta", details.join(" · ")),
      );
      const remove = h("button", "btn-link statement-remove", st.remove);
      remove.type = "button";
      remove.setAttribute("aria-label", fill(st.removeLabel, { label: s.label }));
      remove.addEventListener("click", () => removeStatement(s.label));
      li.append(text, remove);
      return li;
    }),
  );
}

function removeStatement(label: string) {
  loaded = loaded.filter((l) => l.label !== label);
  if (!loaded.length) return reset();
  recompute();
  if (!result) return;
  el("cleanup").hidden = loaded.reduce((n, l) => n + countUnchanged(l.parsed), 0) === 0;
  render(result, { keepView: true });
  statusEl.textContent = fill(t.statements.removed, { label });
  el("add-statement").focus();
}

/** One-line verdict on the done card. Only says "matches" when it's true. */
function renderStatus(res: ParseResult) {
  const st = r.status;
  const review = res.transactions.filter(needsReview).length;
  let ok: boolean | null;
  let text: string;
  if (res.checks.totalsMatchStatement === false) {
    ok = false;
    text = st.totalsOff;
  } else if (res.checks.runningBalanceOk === false || review > 0) {
    ok = false;
    text = plural(st.gaps, review);
  } else if (res.checks.runningBalanceOk || res.checks.totalsMatchStatement) {
    ok = true;
    text = st.ok;
  } else {
    ok = null;
    // The general reader can't vouch for a statement it couldn't check: say so plainly.
    text = res.source === "generic" ? st.unchecked : st.none;
  }
  const box = el("done-status");
  box.className = `done-status ${ok === null ? "is-na" : ok ? "is-ok" : "is-warn"}`;
  el("done-status-text").textContent = text;
}

function renderOverview(res: Workbook, s: Summary) {
  const o = r.overview;
  // Balances from different accounts don't add up to one starting or ending balance.
  const missing = res.accounts > 1 ? r.severalAccounts : o.notShown;
  const net = el("ov-net");
  net.textContent = signed(s.net);
  net.classList.toggle("is-in", s.net > 0);
  el("ov-opening").textContent =
    res.openingBalance !== undefined ? peso(res.openingBalance) : missing;
  el("ov-closing").textContent =
    res.closingBalance !== undefined ? peso(res.closingBalance) : missing;
  el("ov-in").textContent = `+${peso(s.moneyIn)}`;
  el("ov-out").textContent = peso(-s.moneyOut);
  const max = Math.max(s.moneyIn, s.moneyOut, 1);
  // Widths are set via CSSOM (allowed by the CSP), not inline style attributes.
  el("bar-in").style.width = `${(s.moneyIn / max) * 100}%`;
  el("bar-out").style.width = `${(s.moneyOut / max) * 100}%`;
  el("ov-in-count").textContent = plural(o.count, s.countIn);
  el("ov-out-count").textContent = plural(o.count, s.countOut);
}

function renderReview(res: ParseResult) {
  const rv = r.review;
  const txs = res.transactions;
  const review = txs.filter(needsReview).length;
  const unchanged = txs.filter((t) => t.balanceIssue?.kind === "unchanged").length;
  const different = txs.filter((t) => t.balanceIssue?.kind === "different").length;
  const readProblems = txs.filter((t) => t.flags?.length).length;

  el("review-title").textContent = review ? plural(rv.title, review) : rv.notes;
  const body: string[] = [];
  if (unchanged + different) {
    const details = [
      unchanged ? fill(rv.unchanged, { n: unchanged }) : "",
      different ? fill(rv.different, { n: different }) : "",
    ].filter(Boolean);
    body.push(fill(rv.gaps, { n: unchanged + different, details: details.join(", ") }));
  }
  if (readProblems) body.push(plural(rv.readProblems, readProblems));
  el("review-body").textContent = body.join(" ");
  el("review-notes").replaceChildren(...res.warnings.map((w) => h("li", "", w)));
  el("review-show").hidden = review === 0;
  el("review").hidden = review === 0 && res.warnings.length === 0;
}

function renderMonths(s: Summary) {
  const m = r.months;
  el("months").hidden = s.months.length < 2;
  el("months-body").replaceChildren(
    ...s.months.map((month) => {
      const tr = h("tr");
      const th = h("th", "", monthName(month.month));
      th.scope = "row";
      const net = month.moneyIn - month.moneyOut;
      const viewBtn = h("button", "btn-link", m.view);
      viewBtn.type = "button";
      viewBtn.setAttribute("aria-label", fill(m.viewLabel, { month: monthName(month.month) }));
      viewBtn.addEventListener("click", () => {
        setView({ ...ALL_VIEW, month: month.month });
        el<HTMLInputElement>("tx-search").value = "";
        focusTable();
      });
      const action = h("td");
      action.append(viewBtn);
      tr.append(
        th,
        h("td", "num is-in", `+${peso(month.moneyIn)}`),
        h("td", "num", peso(-month.moneyOut)),
        h("td", `num${net > 0 ? " is-in" : ""}`, signed(net)),
        h("td", "num", String(month.count)),
        action,
      );
      return tr;
    }),
  );
  const select = el<HTMLSelectElement>("month-filter");
  select.replaceChildren(new Option(r.table.allMonths, ""));
  for (const month of s.months) select.append(new Option(monthName(month.month), month.month));
  select.hidden = s.months.length < 2;
}

function renderCategories(s: Summary) {
  const c = r.categories;
  el("categories").hidden = s.categories.length === 0;
  el("categories-body").replaceChildren(
    ...s.categories.map((cat) => {
      const tr = h("tr");
      const th = h("th");
      th.append(h("span", "cat-dot", ""), cat.category);
      th.dataset.cat = categorySlug(cat.category);
      th.scope = "row";
      const viewBtn = h("button", "btn-link", c.view);
      viewBtn.type = "button";
      viewBtn.setAttribute("aria-label", fill(c.viewLabel, { category: cat.category }));
      viewBtn.addEventListener("click", () => {
        setView({ ...ALL_VIEW, category: cat.category });
        el<HTMLInputElement>("tx-search").value = "";
        focusTable();
      });
      const action = h("td");
      action.append(viewBtn);
      tr.append(
        th,
        h("td", "num", cat.moneyOut ? peso(-cat.moneyOut) : ""),
        h("td", "num is-in", cat.moneyIn ? `+${peso(cat.moneyIn)}` : ""),
        h("td", "num", String(cat.count)),
        action,
      );
      return tr;
    }),
  );
  const select = el<HTMLSelectElement>("category-filter");
  select.replaceChildren(new Option(r.table.allCategories, ""));
  for (const cat of s.categories) {
    select.append(new Option(`${cat.category} (${cat.count})`, cat.category));
  }
  // Keep a filter on a category that no longer has rows selectable, so the view stays explainable.
  if (view.category && !s.categories.some((cat) => cat.category === view.category)) {
    select.append(new Option(`${view.category} (0)`, view.category));
  }
}

/** CSS hook for a category's colour, e.g. "Fees & taxes" → "fees-taxes" (see global.css). */
const categorySlug = (category: string) =>
  category
    .toLowerCase()
    .replace(/[^a-z]+/g, "-")
    .replace(/^-|-$/g, "");

/** Category picker for one row; a change applies to every row with the same description. */
function categorySelect({ row, tx }: IndexedTx) {
  const select = h("select", "cat-select");
  select.dataset.row = String(row);
  select.setAttribute("aria-label", fill(r.table.categoryLabel, { n: row }));
  for (const cat of CATEGORIES) select.append(new Option(cat, cat));
  select.value = tx.category ?? "Other";
  select.dataset.cat = categorySlug(select.value);
  select.addEventListener("change", () => {
    if (!loaded.length || !isCategory(select.value)) return;
    const key = categoryKey(tx.description);
    categoryOverrides.set(key, select.value);
    recompute();
    if (!result) return;
    const same = result.transactions.filter((t) => categoryKey(t.description) === key).length;
    render(result, { keepView: true, keepPage: true });
    statusEl.textContent = plural(r.table.categoryChanged, same, { category: select.value });
    // The table was rebuilt: put focus back on this row's picker if it's still shown.
    document.querySelector<HTMLSelectElement>(`select.cat-select[data-row="${row}"]`)?.focus();
  });
  return select;
}

const WARN_ICON = "M12 3.5 2.5 20h19L12 3.5Zm0 6v5m0 2.6v.1";

/** Why a row is flagged, or null when it's fine. */
function rowWarning(tx: Transaction): string | null {
  const tb = r.table;
  if (tx.flags?.length) return tb.warnRead;
  if (tx.balanceIssue?.kind === "unchanged") return tb.warnUnchanged;
  if (tx.balanceIssue)
    return fill(tb.warnDifferent, { amount: signed(tx.balanceIssue.difference) });
  return null;
}

/**
 * Small warning sign shown in the first column of flagged rows. The reason appears right away on
 * hover, tap or keyboard focus (a native `title` tooltip is slow and never shows on phones).
 */
function warnIcon(reason: string) {
  const wrap = h("button", "row-warn");
  wrap.type = "button";
  wrap.setAttribute("aria-label", reason); // the tip is hidden until shown, so name the button
  const svgNs = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNs, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(svgNs, "path");
  path.setAttribute("d", WARN_ICON);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "1.8");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  svg.append(path);
  // Safari doesn't focus buttons on tap; focus explicitly so the reason shows on phones too.
  wrap.addEventListener("click", () => wrap.focus());
  wrap.append(svg, h("span", "row-warn-tip", reason));
  return wrap;
}

function txRow({ row, tx }: IndexedTx) {
  const c = r.table.columns;
  const tr = h("tr");
  if (needsReview(tx)) tr.className = "flagged";

  const num = h("td", "col-row tabular");
  num.dataset.label = c.row;
  num.append(h("span", "row-n", String(row)));
  const warning = rowWarning(tx);
  if (warning) num.append(warnIcon(warning));

  const date = h("td", "col-date tabular");
  date.dataset.label = c.date;
  date.append(h("span", "cell-main", tx.date), h("span", "cell-sub", tx.time ?? ""));

  const desc = h("td", "col-desc");
  desc.dataset.label = c.description;
  desc.append(h("span", "cell-main", tx.description));
  const statement = result && isCombined(result) ? result.statements[tx.statement ?? 0] : undefined;
  if (statement) desc.append(h("span", "cell-sub cell-statement", statement.label));

  const category = h("td", "col-cat");
  category.dataset.label = c.category;
  category.append(categorySelect({ row, tx }));

  const amount = h(
    "td",
    `num col-amount${tx.credit > 0 ? " is-in" : ""}`,
    tx.credit > 0 ? `+${peso(tx.credit)}` : tx.debit > 0 ? peso(-tx.debit) : "",
  );
  amount.dataset.label = c.amount;

  const balance = h("td", "num col-balance", tx.balance !== undefined ? peso(tx.balance) : "");
  balance.dataset.label = c.balance;

  tr.append(num, date, desc, category, amount, balance);
  return tr;
}

function renderTable() {
  if (!result) return;
  const tb = r.table;
  const txs = result.transactions;

  const counts = filterCounts(txs, { month: view.month, search: view.search });
  for (const btn of document.querySelectorAll<HTMLButtonElement>(".segmented [data-filter]")) {
    const f = btn.dataset.filter as TxFilter;
    btn.setAttribute("aria-pressed", String(f === view.filter));
    const count = btn.querySelector(".seg-count");
    if (count) count.textContent = String(counts[f]);
    btn.hidden = f === "review" && counts.review === 0 && view.filter !== "review";
  }
  el<HTMLSelectElement>("month-filter").value = view.month;
  el<HTMLSelectElement>("category-filter").value = view.category;
  el<HTMLSelectElement>("statement-filter").value = view.statement;

  const page = paginate(filterTransactions(txs, view), view.page, pageSize);
  view.page = page.page;
  el("tx-body").replaceChildren(...page.items.map(txRow));
  el("tx-empty").hidden = page.total > 0;
  el("tx-range").textContent = page.total
    ? fill(tb.range, { from: page.from, to: page.to, total: page.total })
    : "";

  const buttons: HTMLElement[] = [];
  const pageBtn = (label: string, target: number, opts: { current?: boolean; aria?: string }) => {
    const b = h("button", "pager-btn", label);
    b.type = "button";
    if (opts.aria) b.setAttribute("aria-label", opts.aria);
    if (opts.current) b.setAttribute("aria-current", "page");
    b.disabled = target < 1 || target > page.pages || opts.current === true;
    b.addEventListener("click", () => {
      setView({ page: target });
      focusTable();
    });
    return b;
  };
  if (page.pages > 1) {
    buttons.push(pageBtn("‹", page.page - 1, { aria: tb.previous }));
    for (const n of pageButtons(page.page, page.pages)) {
      buttons.push(
        n === "…"
          ? h("span", "pager-gap", "…")
          : pageBtn(String(n), n, { current: n === page.page, aria: fill(tb.page, { n }) }),
      );
    }
    buttons.push(pageBtn("›", page.page + 1, { aria: tb.next }));
  }
  el("pager-buttons").replaceChildren(...buttons);
}

// Crossing the breakpoint (rotating a tablet, resizing a window): keep the first visible row on screen.
wideScreen.addEventListener("change", () => {
  const firstRow = (view.page - 1) * pageSize;
  pageSize = currentPageSize();
  view.page = Math.floor(firstRow / pageSize) + 1;
  if (result) renderTable();
});

function setView(change: Partial<typeof view>) {
  view = { ...view, page: 1, ...change };
  renderTable();
}

function focusTable() {
  const heading = el("tx-heading");
  heading.focus({ preventScroll: true });
  heading.scrollIntoView({ block: "start", behavior: "smooth" });
}

for (const btn of document.querySelectorAll<HTMLButtonElement>(".segmented [data-filter]")) {
  btn.addEventListener("click", () => setView({ filter: btn.dataset.filter as TxFilter }));
}
el<HTMLSelectElement>("month-filter").addEventListener("change", (e) =>
  setView({ month: (e.target as HTMLSelectElement).value }),
);
el<HTMLSelectElement>("statement-filter").addEventListener("change", (e) =>
  setView({ statement: (e.target as HTMLSelectElement).value }),
);
el<HTMLSelectElement>("category-filter").addEventListener("change", (e) =>
  setView({ category: (e.target as HTMLSelectElement).value }),
);
el<HTMLInputElement>("tx-search").addEventListener("input", (e) =>
  setView({ search: (e.target as HTMLInputElement).value }),
);
el("review-show").addEventListener("click", () => {
  el<HTMLInputElement>("tx-search").value = "";
  setView({ ...ALL_VIEW, filter: "review" });
  focusTable();
});

// ---- clean up --------------------------------------------------------------------

const cleanupToggle = el<HTMLInputElement>("cleanup-toggle");
const infoBtn = el<HTMLButtonElement>("cleanup-info-btn");
const infoTip = el<HTMLParagraphElement>("cleanup-info");

function setCleanup(on: boolean) {
  cleanupToggle.checked = on;
}

// Off by default. When on, rows that didn't change the balance are removed from the overview,
// table and downloads (the Excel Summary sheet records how many were removed).
cleanupToggle.addEventListener("change", () => {
  if (!loaded.length) return;
  recompute();
  if (result) render(result, { keepView: true });
});

// On by default: rows in two overlapping statements of the same account are counted once.
const dupesToggle = el<HTMLInputElement>("dupes-toggle");
dupesToggle.addEventListener("change", () => {
  if (!loaded.length) return;
  recompute();
  if (result) render(result, { keepView: true });
});

function showInfo(show: boolean) {
  infoTip.hidden = !show;
  infoBtn.setAttribute("aria-expanded", String(show));
}
infoBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  showInfo(Boolean(infoTip.hidden));
});
document.addEventListener("click", (e) => {
  if (!infoTip.hidden && !infoTip.contains(e.target as Node)) showInfo(false);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !infoTip.hidden) {
    showInfo(false);
    infoBtn.focus();
  }
});

// ---- downloads ----------------------------------------------------------------

function saveBlob(blob: Blob, name: string) {
  // A local object URL: the file is created in memory and saved by the browser, never uploaded.
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

el("download-xlsx").addEventListener("click", async () => {
  if (!result) return;
  try {
    const { toXlsx } = await import("../export/toXlsx.ts");
    saveBlob(
      new Blob([toXlsx(result).slice().buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
      `${exportBaseName(result)}.xlsx`,
    );
  } catch (err) {
    console.error("Download failed:", err);
    showError(t.errors.generic);
  }
});

el("download-csv").addEventListener("click", async () => {
  if (!result) return;
  try {
    const { toCsv } = await import("../export/toCsv.ts");
    saveBlob(
      new Blob([toCsv(result)], { type: "text/csv;charset=utf-8" }),
      `${exportBaseName(result)}.csv`,
    );
  } catch (err) {
    console.error("Download failed:", err);
    showError(t.errors.generic);
  }
});

el("view-transactions").addEventListener("click", () => focusTable());
