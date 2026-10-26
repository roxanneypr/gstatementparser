// Converter UI wiring. Everything runs in the browser: the PDF, its password and the parsed
// transactions are never sent over the network. Heavy libraries (pdf.js, SheetJS) load lazily.
import { formatMoney } from "../lib/money.ts";
import { exportBaseName, summarize } from "../lib/summary.ts";
import type { ParseResult, Transaction } from "../parsers/types.ts";
import { fill, plural, strings } from "../site.ts";

const t = strings.en.converter;
const r = t.results;
const PREVIEW_ROWS = 50;
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
const statusEl = el<HTMLParagraphElement>("status");
const errorEl = el<HTMLParagraphElement>("error");
const results = el<HTMLDivElement>("results");
const states: Record<State, HTMLElement> = {
  idle: el("state-idle"),
  password: passwordForm,
  working: el("state-working"),
  done: el("state-done"),
};

let file: File | null = null;
let result: ParseResult | null = null;

const peso = (centavos: number) =>
  centavos < 0 ? `−₱${formatMoney(-centavos)}` : `₱${formatMoney(centavos)}`;

// ---- panel state ------------------------------------------------------------

function setState(state: State) {
  panel.dataset.state = state;
  for (const [name, node] of Object.entries(states)) node.hidden = name !== state;
  statusEl.textContent = state === "working" ? t.converting : "";
  for (const n of panel.querySelectorAll(".file-name")) n.textContent = file?.name ?? "";
}

function showError(message: string) {
  errorEl.textContent = message;
}

function reset() {
  file = null;
  result = null;
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

// ---- choosing a file ----------------------------------------------------------

chooseBtn.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
  const f = fileInput.files?.[0];
  if (f) void start(f);
});

// Don't let a PDF dropped outside the panel open in the tab.
for (const type of ["dragover", "drop"] as const) {
  window.addEventListener(type, (e) => e.preventDefault());
}
panel.addEventListener("dragover", (e) => {
  e.preventDefault();
  if (panel.dataset.state === "idle") panel.classList.add("dragging");
});
panel.addEventListener("dragleave", () => panel.classList.remove("dragging"));
panel.addEventListener("drop", (e) => {
  e.preventDefault();
  panel.classList.remove("dragging");
  const dropped = e.dataTransfer?.files[0];
  if (dropped && panel.dataset.state === "idle") void start(dropped);
});

function start(f: File) {
  showError("");
  if (f.type !== "application/pdf" && !/\.pdf$/i.test(f.name)) return showError(t.errors.notPdf);
  if (f.size > MAX_BYTES) return showError(t.errors.tooLarge);
  file = f;
  return convert(); // try without a password first; ask only if the PDF needs one
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

function askForPassword(message = "") {
  setState("password");
  showError(message);
  passwordInput.focus();
  passwordInput.select();
}

// ---- convert --------------------------------------------------------------------

async function convert(password?: string) {
  if (!file) return;
  showError("");
  setState("working");
  try {
    const [{ extractText, ExtractError }, { detectParser }] = await Promise.all([
      import("../pdf/extractText.ts"),
      import("../parsers/index.ts"),
    ]);
    let pages;
    try {
      pages = await extractText(await file.arrayBuffer(), password);
    } catch (err) {
      if (err instanceof ExtractError) {
        if (err.kind === "password-required") return askForPassword();
        if (err.kind === "wrong-password") return askForPassword(t.errors.wrongPassword);
        return fail(t.errors.invalidPdf);
      }
      throw err;
    }
    if (!pages.some((p) => p.items.length)) return fail(t.errors.noText);
    const parser = detectParser(pages);
    if (!parser) return fail(t.errors.unsupported);

    result = parser.parse(pages);
    passwordInput.value = ""; // don't keep the password around once it's been used
    render(result);
    setState("done");
    el("done-title").focus();
    void import("../export/toXlsx.ts"); // warm up so the download is instant
  } catch {
    fail(t.errors.generic);
  }
}

function fail(message: string) {
  file = null;
  fileInput.value = "";
  setState("idle");
  showError(message);
}

// ---- results ----------------------------------------------------------------

function render(res: ParseResult) {
  const s = summarize(res);
  el("results-period").textContent =
    res.periodStart && res.periodEnd
      ? fill(r.period, { start: res.periodStart, end: res.periodEnd })
      : "";
  el("stat-count").textContent = String(s.count);
  el("stat-in").textContent = peso(s.moneyIn);
  el("stat-out").textContent = peso(s.moneyOut);
  el("stat-net").textContent = peso(s.net);

  const period =
    res.periodStart && res.periodEnd
      ? fill(r.period, { start: res.periodStart, end: res.periodEnd })
      : "";
  el("done-summary").textContent = fill(s.count === 1 ? t.doneSummaryOne : t.doneSummary, {
    n: s.count,
    period,
  }).replace(/ · $/, "");

  renderChecks(res, s.balanceUnchanged + s.balanceDifferent);
  renderWarnings(res);
  renderPreview(res.transactions);
  results.hidden = false;
}

function renderChecks(res: ParseResult, gaps: number) {
  const c = r.checks;
  const {
    totalsMatchStatement: totals,
    runningBalanceOk: running,
    openingToClosingOk: ends,
  } = res.checks;
  const s = summarize(res);
  const endsDiff =
    res.openingBalance !== undefined && res.closingBalance !== undefined
      ? res.closingBalance - (res.openingBalance + s.moneyIn - s.moneyOut)
      : 0;
  const items: [boolean | null, string][] = [
    [totals, totals === null ? c.totalsNone : totals ? c.totalsOk : c.totalsBad],
    [
      running,
      running === null ? c.runningNone : running ? c.runningOk : plural(c.runningBad, gaps),
    ],
    [
      ends,
      ends === null ? c.endsNone : ends ? c.endsOk : fill(c.endsBad, { amount: peso(endsDiff) }),
    ],
  ];
  const list = el<HTMLUListElement>("checks");
  list.replaceChildren(
    ...items.map(([ok, text]) => {
      const li = document.createElement("li");
      li.className = ok === null ? "check-na" : ok ? "check-ok" : "check-warn";
      const icon = document.createElement("span");
      icon.className = "check-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = ok === null ? "–" : ok ? "✓" : "!";
      li.append(icon, document.createTextNode(text));
      return li;
    }),
  );
}

function rowLabel(index: number, tx: Transaction, extra?: string) {
  const parts = [
    `#${index + 1}`,
    [tx.date, tx.time].filter(Boolean).join(" "),
    tx.description,
    tx.debit ? `−${peso(tx.debit)}` : tx.credit ? `+${peso(tx.credit)}` : "",
    extra ?? "",
  ];
  return parts.filter(Boolean).join(" · ");
}

function group(title: string, body: string, lines: string[], open = false): HTMLDetailsElement {
  const details = document.createElement("details");
  details.open = open;
  const summary = document.createElement("summary");
  summary.textContent = title;
  const p = document.createElement("p");
  p.textContent = body;
  const ul = document.createElement("ul");
  ul.append(
    ...lines.map((line) => {
      const li = document.createElement("li");
      li.textContent = line;
      return li;
    }),
  );
  details.append(summary, p, ul);
  return details;
}

function renderWarnings(res: ParseResult) {
  const txs = res.transactions.map((tx, i) => ({ tx, i }));
  const unchanged = txs.filter(({ tx }) => tx.balanceIssue?.kind === "unchanged");
  const different = txs.filter(({ tx }) => tx.balanceIssue?.kind === "different");
  const readProblems = txs.filter(({ tx }) => tx.flags?.length);

  const groups: HTMLElement[] = [];
  if (readProblems.length) {
    groups.push(
      group(
        plural(r.readProblemsTitle, readProblems.length),
        r.readProblemsBody,
        readProblems.map(({ tx, i }) => rowLabel(i, tx, tx.flags?.join("; "))),
        true,
      ),
    );
  }
  if (unchanged.length) {
    groups.push(
      group(
        plural(r.unchangedTitle, unchanged.length),
        r.unchangedBody,
        unchanged.map(({ tx, i }) => rowLabel(i, tx)),
      ),
    );
  }
  if (different.length) {
    groups.push(
      group(
        plural(r.differentTitle, different.length),
        r.differentBody,
        different.map(({ tx, i }) =>
          rowLabel(i, tx, fill(r.offBy, { amount: peso(tx.balanceIssue?.difference ?? 0) })),
        ),
      ),
    );
  }
  if (res.warnings.length) {
    groups.push(group(r.otherTitle, "", res.warnings, true));
  }
  el("warnings-body").replaceChildren(...groups);
  el("warnings").hidden = groups.length === 0;
}

function cell(text: string, label: string, className?: string) {
  const td = document.createElement("td");
  td.textContent = text;
  td.dataset.label = label;
  if (className) td.className = className;
  return td;
}

function checkText(tx: Transaction) {
  if (tx.flags?.length) return r.checkReadProblem;
  if (!tx.balanceIssue) return r.checkOk;
  return tx.balanceIssue.kind === "unchanged"
    ? r.checkUnchanged
    : fill(r.checkDifferent, { amount: peso(tx.balanceIssue.difference) });
}

function renderPreview(txs: Transaction[]) {
  const cols = r.columns;
  const rows = txs.slice(0, PREVIEW_ROWS).map((tx, i) => {
    const tr = document.createElement("tr");
    if (tx.flags?.length || tx.balanceIssue) tr.className = "flagged";
    tr.append(
      cell(String(i + 1), cols.row, "row-num"),
      cell([tx.date, tx.time].filter(Boolean).join(" "), cols.date, "nowrap"),
      cell(tx.description, cols.description, "desc"),
      cell(tx.debit ? peso(tx.debit) : "", cols.debit, "num"),
      cell(tx.credit ? peso(tx.credit) : "", cols.credit, "num"),
      cell(tx.balance !== undefined ? peso(tx.balance) : "", cols.balance, "num"),
      cell(checkText(tx), cols.check),
    );
    return tr;
  });
  el("preview-body").replaceChildren(...rows);
  el("preview-note").textContent =
    txs.length > PREVIEW_ROWS
      ? fill(r.previewNote, { shown: PREVIEW_ROWS, total: txs.length })
      : fill(r.previewAll, { total: txs.length });
}

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
    const bytes = toXlsx(result);
    saveBlob(
      new Blob([bytes.slice().buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
      `${exportBaseName(result)}.xlsx`,
    );
  } catch {
    showError(t.errors.generic);
  }
});

el("download-csv").addEventListener("click", async () => {
  if (!result) return;
  const { toCsv } = await import("../export/toCsv.ts");
  saveBlob(
    new Blob([toCsv(result)], { type: "text/csv;charset=utf-8" }),
    `${exportBaseName(result)}.csv`,
  );
});
