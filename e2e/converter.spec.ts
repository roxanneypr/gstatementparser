import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { read, utils } from "xlsx";
import { PASSWORD } from "./global-setup.ts";

const pdf = (name: string) => `e2e/.generated/${name}.pdf`;

/** Record every request and any CSP violation / console error for privacy assertions. */
function watch(page: Page) {
  const requests: { url: string; method: string; body: number }[] = [];
  const problems: string[] = [];
  page.on("request", (r) =>
    requests.push({ url: r.url(), method: r.method(), body: r.postDataBuffer()?.length ?? 0 }),
  );
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(m.text());
  });
  page.on("pageerror", (e) => problems.push(e.message));
  return { requests, problems };
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    document.addEventListener("securitypolicyviolation", (e) =>
      console.error(`CSP violation: ${e.violatedDirective} ${e.blockedURI}`),
    ),
  );
  await page.goto("/");
});

/** Click the big button and pick a file, like a user would. */
async function choose(page: Page, file: string) {
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.click("#choose-btn"),
  ]);
  await chooser.setFiles(file);
}

test("one button: choose a protected PDF, enter the password, download — nothing is sent", async ({
  page,
}) => {
  const { requests, problems } = watch(page);
  await expect(page.locator("#choose-btn")).toHaveText("Choose your statement");
  await choose(page, pdf("protected"));

  // The PDF asks for a password, so the panel asks for one.
  await expect(page.locator("#state-password")).toBeVisible();
  await expect(page.locator("#state-password .file-name")).toHaveText("protected.pdf");
  await expect(page.locator("#pdf-password")).toBeFocused();

  await page.fill("#pdf-password", "wrong");
  await page.keyboard.press("Enter");
  await expect(page.locator("#error")).toHaveText("Wrong password, try again.");
  await expect(page.locator("#state-password")).toBeVisible();

  await page.fill("#pdf-password", PASSWORD);
  await page.click("#state-password button[type=submit]");

  await expect(page.locator("#state-done")).toBeVisible();
  await expect(page.locator("#done-title")).toBeFocused();
  await expect(page.locator("#error")).toBeEmpty();
  await expect(page.locator("#done-summary")).toHaveText(
    "GCash · Mar 1 – Mar 31, 2026 · 9 transactions",
  );
  await expect(page.locator("#pdf-password")).toHaveValue(""); // password not kept
  await expect(page.locator("#ov-in")).toHaveText("+₱12,505.00");
  await expect(page.locator("#ov-out")).toHaveText("−₱2,983.50");
  await expect(page.locator("#ov-net")).toHaveText("+₱9,521.50");
  await expect(page.locator("#ov-opening")).toHaveText("₱1,500.00");
  await expect(page.locator("#ov-closing")).toHaveText("₱11,021.50");
  // Checked against the statement: everything matches, and it says so.
  await expect(page.locator("#done-status")).toHaveClass(/is-ok/);
  await expect(page.locator("#done-status-text")).toHaveText(
    "Checked against your statement. Every running balance matches.",
  );
  await expect(page.locator("#view-all-text")).toHaveText("View all 9 transactions");
  await expect(page.locator("#cleanup")).toBeHidden(); // nothing to clean up
  await expect(page.locator("#review")).toBeHidden();
  await expect(page.locator("#months")).toBeHidden(); // single month
  await expect(page.locator("#tx-body tr")).toHaveCount(9);
  await expect(page.locator("#tx-body tr").first()).not.toContainText("1000000000001"); // ref no. not shown
  await expect(page.locator("#tx-range")).toHaveText("1–9 of 9");
  await expect(page.locator("#pager-buttons button")).toHaveCount(0);

  const [xlsx] = await Promise.all([page.waitForEvent("download"), page.click("#download-xlsx")]);
  expect(xlsx.suggestedFilename()).toBe("gcash-statement_2026-03-01_to_2026-03-31.xlsx");
  const wb = read(readFileSync((await xlsx.path())!));
  expect(wb.SheetNames).toEqual(["Transactions", "Summary"]);
  expect(utils.sheet_to_json(wb.Sheets.Transactions!)).toHaveLength(9);

  const [csv] = await Promise.all([page.waitForEvent("download"), page.click("#download-csv")]);
  expect(csv.suggestedFilename()).toBe("gcash-statement_2026-03-01_to_2026-03-31.csv");
  const text = readFileSync((await csv.path())!, "utf8");
  expect(text.charCodeAt(0)).toBe(0xfeff);
  expect(text.trimEnd().split("\r\n")).toHaveLength(10);

  // Privacy: only same-origin GETs for the site's own files; nothing carries data.
  const origin = new URL(page.url()).origin;
  const external = requests.filter(
    (r) => !r.url.startsWith(origin) && !/^(blob|data):/.test(r.url),
  );
  expect(external).toEqual([]);
  expect(requests.filter((r) => r.method !== "GET" || r.body > 0)).toEqual([]);
  expect(problems).toEqual([]);
});

test("categories: guessed per row, totalled, filterable, editable and exported", async ({
  page,
}) => {
  const { requests, problems } = watch(page);
  await choose(page, pdf("protected"));
  await page.fill("#pdf-password", PASSWORD);
  await page.keyboard.press("Enter");
  await expect(page.locator("#state-done")).toBeVisible();

  const rows = page.locator("#tx-body tr");
  const first = page.getByLabel("Category for row 1");
  await expect(first).toHaveValue("Food"); // "Payment to Sample Coffee Shop"
  await expect(page.locator("#categories")).toBeVisible();
  await expect(page.locator("#categories-body tr").filter({ hasText: "Food" })).toContainText(
    "−₱499.00",
  );

  await page.getByRole("button", { name: "View Food transactions" }).click();
  await expect(page.locator("#category-filter")).toHaveValue("Food");
  await expect(rows).toHaveCount(2);
  await page.selectOption("#category-filter", "");
  await expect(rows).toHaveCount(9);

  // Changing a row applies to its description and is announced; focus stays on the picker.
  await first.selectOption("Shopping");
  await expect(page.locator("#status")).toHaveText("Category changed to Shopping.");
  await expect(page.getByLabel("Category for row 1")).toBeFocused();
  await expect(page.getByLabel("Category for row 1")).toHaveValue("Shopping");

  const [xlsx] = await Promise.all([page.waitForEvent("download"), page.click("#download-xlsx")]);
  const ws = read(readFileSync((await xlsx.path())!)).Sheets.Transactions!;
  expect(ws.J1?.v).toBe("Category");
  expect(ws.J2?.v).toBe("Shopping");
  const [csv] = await Promise.all([page.waitForEvent("download"), page.click("#download-csv")]);
  expect(readFileSync((await csv.path())!, "utf8").split("\r\n")[1]).toMatch(/,Shopping$/);

  expect(requests.filter((r) => r.method !== "GET" || r.body > 0)).toEqual([]);
  expect(problems).toEqual([]);
});

test("converts a Maya statement: detected, checked and labelled Maya in the downloads", async ({
  page,
}) => {
  await choose(page, pdf("maya"));
  await page.fill("#pdf-password", PASSWORD);
  await page.keyboard.press("Enter");
  await expect(page.locator("#state-done")).toBeVisible();
  await expect(page.locator("#done-summary")).toHaveText(
    "Maya · Sep 1 – Sep 30, 2026 · 6 transactions",
  );
  await expect(page.locator("#done-status")).toHaveClass(/is-ok/);
  await expect(page.locator("#done-status-text")).toHaveText(
    "Checked against your statement. Every running balance matches.",
  );

  const [xlsx] = await Promise.all([page.waitForEvent("download"), page.click("#download-xlsx")]);
  expect(xlsx.suggestedFilename()).toBe("maya-statement_2026-09-01_to_2026-09-30.xlsx");
  const wb = read(readFileSync((await xlsx.path())!));
  const rows = utils.sheet_to_json<Record<string, unknown>>(wb.Sheets.Transactions!);
  expect(rows).toHaveLength(6);
  expect(rows[1]).toMatchObject({ Description: "Sent to bank · Instapay Sending", Debit: 1000 });
  expect(rows[2]).toMatchObject({ Credit: 2500 });
  const summary = utils.sheet_to_json<unknown[]>(wb.Sheets.Summary!, { header: 1 });
  expect(summary[0]).toEqual(["Maya statement summary"]);
});

test("the Maya page's sample runs the FAKE Maya statement", async ({ page }) => {
  await page.goto("/maya-statement-to-excel");
  await page.getByRole("button", { name: "Try a sample statement" }).click();
  await expect(page.locator("#done-summary")).toHaveText(
    "Maya · Sep 1 – Sep 30, 2026 · 15 transactions",
  );
  await expect(page.locator("#done-status-text")).toHaveText(
    "Checked against your statement. Every running balance matches.",
  );
});

test("converts a BPI statement: years from the period, labelled BPI in the downloads", async ({
  page,
}) => {
  await choose(page, pdf("bpi"));
  await expect(page.locator("#state-done")).toBeVisible();
  await expect(page.locator("#done-summary")).toHaveText(
    "BPI · May 13 – Aug 13, 2026 · 7 transactions",
  );
  await expect(page.locator("#done-status-text")).toHaveText(
    "Checked against your statement. Every running balance matches.",
  );

  const [xlsx] = await Promise.all([page.waitForEvent("download"), page.click("#download-xlsx")]);
  expect(xlsx.suggestedFilename()).toBe("bpi-statement_2026-05-13_to_2026-08-13.xlsx");
  const wb = read(readFileSync((await xlsx.path())!));
  const rows = utils.sheet_to_json<Record<string, unknown>>(wb.Sheets.Transactions!);
  expect(rows).toHaveLength(7);
  expect(rows[0]).toMatchObject({ Description: "Bizlink Payroll · BIZLINK", Credit: 25000 });
  expect(rows[1]).toMatchObject({
    Description: "InstaPay Transfer · TRANSFER TO OTHER BANK",
    Debit: 10000,
  });
  const summary = utils.sheet_to_json<unknown[]>(wb.Sheets.Summary!, { header: 1 });
  expect(summary[0]).toEqual(["BPI statement summary"]);
});

test("the BPI page's sample runs the FAKE BPI statement", async ({ page }) => {
  await page.goto("/bpi-statement-to-excel");
  await page.getByRole("button", { name: "Try a sample statement" }).click();
  await expect(page.locator("#done-summary")).toHaveText(
    "BPI · May 13 – Aug 13, 2026 · 22 transactions",
  );
  await expect(page.locator("#done-status-text")).toHaveText(
    "Checked against your statement. Every running balance matches.",
  );
});

test("converts BDO Account Activities: oldest first, no balance claims", async ({ page }) => {
  await choose(page, pdf("bdo"));
  await expect(page.locator("#state-done")).toBeVisible();
  await expect(page.locator("#done-summary")).toHaveText(
    "BDO · Sep 1 – Oct 31, 2026 · 6 transactions",
  );
  await expect(page.locator("#done-status")).toHaveClass(/is-na/);
  await expect(page.locator("#done-status-text")).toHaveText(
    "Your statement doesn't show balances to check against.",
  );
  await expect(page.locator("#review")).toBeHidden();

  const [xlsx] = await Promise.all([page.waitForEvent("download"), page.click("#download-xlsx")]);
  expect(xlsx.suggestedFilename()).toBe("bdo-statement_2026-09-01_to_2026-10-31.xlsx");
  const wb = read(readFileSync((await xlsx.path())!));
  const rows = utils.sheet_to_json<Record<string, unknown>>(wb.Sheets.Transactions!);
  expect(rows).toHaveLength(6);
  expect(rows[0]).toMatchObject({ Description: "Payment via QRPH", Debit: 642.75 });
  expect(rows[5]).toMatchObject({
    Description: "Sent to ****1234",
    "Reference No.": "PC-BDOPAY1-P-20261020-00000001",
  });
});

test("the BDO page's sample runs the FAKE BDO Account Activities", async ({ page }) => {
  await page.goto("/bdo-statement-to-excel");
  await page.getByRole("button", { name: "Try a sample statement" }).click();
  await expect(page.locator("#done-summary")).toHaveText(
    "BDO · Aug 27 – Oct 27, 2026 · 25 transactions",
  );
});

test("a PDF without a password converts straight away", async ({ page }) => {
  await page.setInputFiles("#pdf-file", pdf("clean"));
  await expect(page.locator("#state-done")).toBeVisible();
  await expect(page.locator("#state-password")).toBeHidden();
});

test("asks for the password again if it's left empty", async ({ page }) => {
  await page.setInputFiles("#pdf-file", pdf("protected"));
  await page.click("#state-password button[type=submit]");
  await expect(page.locator("#error")).toHaveText("Enter the PDF password.");
});

test("points out balance gaps without changing the figures", async ({ page }) => {
  await page.setInputFiles("#pdf-file", pdf("balance-gap"));
  // Never claims "every balance matches" when it doesn't.
  await expect(page.locator("#done-status")).toHaveClass(/is-warn/);
  await expect(page.locator("#done-status-text")).toHaveText(
    "Checked against your statement. 2 rows need a look.",
  );
  await expect(page.locator("#review")).toBeVisible();
  await expect(page.locator("#review-title")).toHaveText("2 rows need a look");
  await expect(page.locator("#review-body")).toContainText(
    "1 unchanged, 1 moved by a different amount",
  );
  const row5 = page.locator("#tx-body tr").nth(4);
  await expect(row5).toHaveClass(/flagged/);
  await expect(row5).toContainText("₱2,855.00");
  const warn = row5.locator(".row-warn");
  await expect(warn).toHaveAccessibleName("Balance didn't change");
  await expect(warn.locator(".row-warn-tip")).toBeHidden();
  await warn.hover();
  await expect(warn.locator(".row-warn-tip")).toBeVisible();
  await expect(warn.locator(".row-warn-tip")).toHaveText("Balance didn't change");
  await expect(page.locator("#tx-body .row-warn")).toHaveCount(2); // only the flagged rows
});

test("explains files it can't convert and stays on the first step", async ({ page }) => {
  const cases: [string, RegExp][] = [
    ["not-really", /couldn't be opened as a PDF/],
    ["no-text", /no readable text/],
    ["not-gcash", /doesn't look like a GCash, Maya, BPI or BDO statement/],
  ];
  for (const [name, message] of cases) {
    await page.setInputFiles("#pdf-file", pdf(name));
    await expect(page.locator("#error")).toHaveText(message);
    await expect(page.locator("#state-idle")).toBeVisible();
    await expect(page.locator("#results")).toBeHidden();
  }
});

test("choose a different file / convert another", async ({ page }) => {
  await page.setInputFiles("#pdf-file", pdf("protected"));
  await expect(page.locator("#state-password")).toBeVisible();
  await page.click("#state-password .btn-link");
  await expect(page.locator("#state-idle")).toBeVisible();
  await expect(page.locator("#choose-btn")).toBeFocused();

  await page.setInputFiles("#pdf-file", pdf("clean"));
  await expect(page.locator("#state-done")).toBeVisible();
  await page.click("#reset");
  await expect(page.locator("#state-idle")).toBeVisible();
  await expect(page.locator("#results")).toBeHidden();
  await page.setInputFiles("#pdf-file", pdf("balance-gap"));
  await expect(page.locator("#review")).toBeVisible();
});

test("explains when the converter code can't load (e.g. stale cache, offline)", async ({
  page,
}) => {
  await page.route(/extractText.*\.js/, (route) => route.abort());
  await page.setInputFiles("#pdf-file", pdf("clean"));
  await expect(page.locator("#error")).toHaveText(/couldn't finish loading.*refresh the page/);
  await expect(page.locator("#state-idle")).toBeVisible();
});

test("statement details: pages of 20, filters, months, search and rows to review", async ({
  page,
}) => {
  await page.setInputFiles("#pdf-file", pdf("two-months-gaps"));
  await expect(page.locator("#results")).toBeVisible();
  const rows = page.locator("#tx-body tr");
  const range = page.locator("#tx-range");

  // Pagination
  await expect(rows).toHaveCount(20);
  await expect(range).toHaveText("1–20 of 45");
  // Columns keep their width from page to page (fixed table layout).
  const widths = () =>
    page.$$eval(".tx-table thead th", (ths) => ths.map((th) => th.getBoundingClientRect().width));
  const before = await widths();
  await page.getByRole("button", { name: "Page 3" }).click();
  await expect(range).toHaveText("41–45 of 45");
  expect(await widths()).toEqual(before);
  await expect(rows).toHaveCount(5);
  await expect(page.getByRole("button", { name: "Page 3" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await page.getByRole("button", { name: "Previous" }).click();
  await expect(range).toHaveText("21–40 of 45");

  // Filters reset to page 1 and show counts
  await page.click('[data-filter="in"]');
  await expect(page.locator('[data-filter="in"]')).toHaveAttribute("aria-pressed", "true");
  await expect(range).toHaveText("1–7 of 7");
  await expect(rows.first().locator(".col-amount")).toHaveText(/^\+₱/);

  // Month view: two months, "View" filters the table
  await expect(page.locator("#months")).toBeVisible();
  await expect(page.locator("#months-body tr")).toHaveCount(2);
  await page.getByRole("button", { name: "View April 2026 transactions" }).click();
  await expect(page.locator("#month-filter")).toHaveValue("2026-04");
  await expect(page.locator('[data-filter="all"]')).toHaveAttribute("aria-pressed", "true");
  await expect(range).toHaveText(/of 22$/);

  // Search by reference no. (across all months)
  await page.selectOption("#month-filter", "");
  await page.fill("#tx-search", "4000000000031");
  await expect(rows).toHaveCount(1);
  await expect(rows.first().locator(".row-warn")).toHaveAccessibleName("Balance didn't change");
  await page.fill("#tx-search", "no such thing");
  await expect(page.locator("#tx-empty")).toBeVisible();

  // "Show rows to review" jumps to just the flagged rows
  await expect(page.locator("#review-title")).toHaveText("3 rows need a look");
  await page.getByRole("button", { name: "Show them" }).click();
  await expect(page.locator("#tx-search")).toHaveValue("");
  await expect(page.locator('[data-filter="review"]')).toHaveAttribute("aria-pressed", "true");
  await expect(rows).toHaveCount(3);
  await expect(page.locator("#tx-body tr.flagged")).toHaveCount(3);
  await expect(page.locator("#tx-body .row-n")).toHaveText(["8", "9", "31"]);
});

// The "Is it safe to convert a bank statement PDF online?" post tells readers to run the sample,
// go offline, then convert their own file. Keep that advice true.
test("after the sample has run, converts and downloads with no internet", async ({
  page,
  context,
}) => {
  await page.getByRole("button", { name: "Try a sample statement" }).click();
  await expect(page.locator("#state-done")).toBeVisible();

  await context.setOffline(true);
  await page.click("#reset");
  await choose(page, pdf("protected"));
  await page.fill("#pdf-password", PASSWORD);
  await page.keyboard.press("Enter");
  await expect(page.locator("#state-done")).toBeVisible();
  const [xlsx] = await Promise.all([page.waitForEvent("download"), page.click("#download-xlsx")]);
  expect(xlsx.suggestedFilename()).toMatch(/\.xlsx$/);
});

test("try a sample statement: runs the real converter on the bundled FAKE PDF", async ({
  page,
}) => {
  const { requests, problems } = watch(page);
  await page.getByRole("button", { name: "Try a sample statement" }).click();
  await expect(page.locator("#state-done")).toBeVisible();
  await expect(page.locator("#done-summary")).toHaveText(
    "GCash · Mar 1 – Apr 30, 2026 · 34 transactions",
  );
  await expect(page.locator("#review-title")).toHaveText("1 row needs a look");
  await expect(page.locator("#months-body tr")).toHaveCount(2);
  await page.getByRole("button", { name: "View all 34 transactions" }).click();
  await expect(page.locator("#tx-heading")).toBeFocused();
  // The only extra request is a same-origin GET for the sample file; nothing is sent.
  const origin = new URL(page.url()).origin;
  expect(
    requests.filter((r) => r.url === `${origin}/sample/sample-gcash-statement.pdf`),
  ).toHaveLength(1);
  expect(requests.filter((r) => !r.url.startsWith(origin) && !/^(blob|data):/.test(r.url))).toEqual(
    [],
  );
  expect(requests.filter((r) => r.method !== "GET" || r.body > 0)).toEqual([]);
  expect(problems).toEqual([]);
});

test("home page: header Convert button jumps to the converter and keeps results", async ({
  page,
  isMobile,
}) => {
  const cta = page.locator(".nav-cta");
  await expect(cta).toHaveAttribute("href", "#convert");
  await expect(page.locator(".example tbody tr")).toHaveCount(4);
  // "Drag and drop" only makes sense with a mouse.
  if (isMobile) await expect(page.locator(".drag-hint")).toBeHidden();
  else await expect(page.locator(".drag-hint")).toBeVisible();
  // The main button is visible without scrolling.
  const box = await page.locator("#choose-btn").boundingBox();
  const viewport = page.viewportSize();
  expect(box && viewport && box.y + box.height <= viewport.height).toBe(true);

  // Idle: focuses the main button. After converting: no reload, results stay.
  await cta.click();
  await expect(page.locator("#choose-btn")).toBeFocused();
  await page.setInputFiles("#pdf-file", pdf("two-months"));
  await expect(page.locator("#state-done")).toBeVisible();
  await page.locator("#tx-heading").scrollIntoViewIfNeeded();
  await cta.click();
  await expect(page.locator("#done-title")).toBeFocused();
  await expect(page.locator("#results")).toBeVisible();
  await expect(page.locator("#tx-range")).toHaveText("1–20 of 45");

  // Other pages link to the converter on the home page.
  await page.goto("/about");
  await expect(page.locator(".nav-cta")).toHaveAttribute("href", "/#convert");
  await page.locator(".nav-cta").click();
  await expect(page).toHaveURL(/\/#convert$/);
  await expect(page.locator("#choose-btn")).toBeVisible();
});

test("clean up (off by default) removes rows that didn't change the balance, incl. downloads", async ({
  page,
}) => {
  await page.setInputFiles("#pdf-file", pdf("two-months-gaps"));
  await expect(page.locator("#state-done")).toBeVisible();
  const toggle = page.locator("#cleanup-toggle");
  await expect(page.locator("#cleanup")).toBeVisible();
  await expect(toggle).not.toBeChecked();
  await expect(page.locator("#tx-range")).toHaveText("1–20 of 45");

  // The info icon explains it in one line; Escape closes it.
  await page.getByRole("button", { name: "What does clean up do?" }).click();
  await expect(page.locator("#cleanup-info")).toHaveText(
    "Removes transactions that didn't change your balance.",
  );
  await page.keyboard.press("Escape");
  await expect(page.locator("#cleanup-info")).toBeHidden();

  await toggle.check();
  await expect(page.locator("#tx-range")).toHaveText("1–20 of 42");
  await expect(page.locator("#done-summary")).toContainText("42 transactions");
  await expect(page.locator("#done-status")).toHaveClass(/is-ok/);
  await page.fill("#tx-search", "Balance unchanged");
  await page.fill("#tx-search", "");
  await expect(page.locator("#tx-body tr.flagged")).toHaveCount(0);

  const [xlsx] = await Promise.all([page.waitForEvent("download"), page.click("#download-xlsx")]);
  const wb = read(readFileSync((await xlsx.path())!));
  expect(utils.sheet_to_json(wb.Sheets.Transactions!)).toHaveLength(42);
  const summary = utils.sheet_to_json<unknown[]>(wb.Sheets.Summary!, { header: 1 });
  expect(summary.find((r) => String(r[0]).startsWith("Removed by clean-up"))?.[1]).toBe(3);

  // Turning it off brings every row back.
  await toggle.uncheck();
  await expect(page.locator("#tx-range")).toHaveText("1–20 of 45");
});
