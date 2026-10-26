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

const form = el<HTMLFormElement>("convert-form");
const fileInput = el<HTMLInputElement>("pdf-file");
const dropzone = el<HTMLDivElement>("dropzone");
const fileName = el<HTMLParagraphElement>("file-name");
const passwordInput = el<HTMLInputElement>("pdf-password");
const togglePassword = el<HTMLButtonElement>("toggle-password");
const convertBtn = el<HTMLButtonElement>("convert-btn");
const statusEl = el<HTMLParagraphElement>("status");
const errorEl = el<HTMLParagraphElement>("error");
const results = el<HTMLDivElement>("results");

let file: File | null = null;
let result: ParseResult | null = null;

const peso = (centavos: number) =>
  centavos < 0 ? `−₱${formatMoney(-centavos)}` : `₱${formatMoney(centavos)}`;

// ---- file selection -------------------------------------------------------

function setFile(f: File | null) {
  file = f;
  fileName.textContent = f ? fill(t.selected, { name: f.name }) : "";
  showError("");
}

fileInput.addEventListener("change", () => setFile(fileInput.files?.[0] ?? null));

// Don't let a PDF dropped outside the box open in the tab.
for (const type of ["dragover", "drop"] as const) {
  window.addEventListener(type, (e) => e.preventDefault());
}
dropzone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropzone.classList.add("dragging");
});
dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragging"));
dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropzone.classList.remove("dragging");
  const dropped = e.dataTransfer?.files[0];
  if (dropped) setFile(dropped);
});

togglePassword.addEventListener("click", () => {
  const show = passwordInput.type === "password";
  passwordInput.type = show ? "text" : "password";
  togglePassword.textContent = show ? t.hidePassword : t.showPassword;
  togglePassword.setAttribute("aria-pressed", String(show));
});

// ---- convert ----------------------------------------------------------------

function showError(message: string, focus?: HTMLElement) {
  errorEl.textContent = message;
  if (message) statusEl.textContent = "";
  if (focus) {
    focus.focus();
    if (focus instanceof HTMLInputElement && focus.type !== "file") focus.select();
  }
}

function setBusy(busy: boolean) {
  convertBtn.disabled = busy;
  form.setAttribute("aria-busy", String(busy));
  statusEl.textContent = busy ? t.converting : "";
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!file) return showError(t.errors.noFile, fileInput);
  if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) {
    return showError(t.errors.notPdf, fileInput);
  }
  if (file.size > MAX_BYTES) return showError(t.errors.tooLarge, fileInput);

  showError("");
  setBusy(true);
  try {
    const [{ extractText, ExtractError }, { detectParser }] = await Promise.all([
      import("../pdf/extractText.ts"),
      import("../parsers/index.ts"),
    ]);
    let pages;
    try {
      pages = await extractText(await file.arrayBuffer(), passwordInput.value);
    } catch (err) {
      if (err instanceof ExtractError) {
        if (err.kind === "password-required")
          return showError(t.errors.passwordRequired, passwordInput);
        if (err.kind === "wrong-password") return showError(t.errors.wrongPassword, passwordInput);
        return showError(t.errors.invalidPdf, fileInput);
      }
      throw err;
    }
    if (!pages.some((p) => p.items.length)) return showError(t.errors.noText, fileInput);
    const parser = detectParser(pages);
    if (!parser) return showError(t.errors.unsupported, fileInput);

    result = parser.parse(pages);
    passwordInput.value = ""; // don't keep the password around once it's been used
    render(result);
    void import("../export/toXlsx.ts"); // warm up so the download is instant
  } catch {
    showError(t.errors.generic);
  } finally {
    setBusy(false);
  }
});

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

  renderChecks(res, s.balanceUnchanged + s.balanceDifferent);
  renderWarnings(res);
  renderPreview(res.transactions);

  form.hidden = true;
  results.hidden = false;
  el("results-heading").focus();
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

el("reset").addEventListener("click", () => {
  result = null;
  form.reset();
  setFile(null);
  passwordInput.type = "password";
  togglePassword.textContent = t.showPassword;
  togglePassword.setAttribute("aria-pressed", "false");
  results.hidden = true;
  form.hidden = false;
  fileInput.focus();
});
