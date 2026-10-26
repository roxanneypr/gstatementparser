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
  await expect(page.locator("#choose-btn")).toHaveText("Choose your GCash PDF");
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
    "9 transactions · 2026-03-01 to 2026-03-31",
  );
  await expect(page.locator("#pdf-password")).toHaveValue(""); // password not kept
  await expect(page.locator("#ov-in")).toHaveText("+₱12,505.00");
  await expect(page.locator("#ov-out")).toHaveText("−₱2,983.50");
  await expect(page.locator("#ov-net")).toHaveText("+₱9,521.50");
  await expect(page.locator("#ov-opening")).toHaveText("₱1,500.00");
  await expect(page.locator("#ov-closing")).toHaveText("₱11,021.50");
  // Cross-check: statement totals shown next to calculated ones, all matching.
  await expect(page.locator("#verify-body tr")).toHaveCount(4);
  await expect(page.locator("#verify-body .pill-ok")).toHaveCount(4);
  await expect(page.locator("#verify-body tr").first()).toContainText("₱12,505.00");
  await expect(page.locator("#review")).toBeHidden();
  await expect(page.locator("#months")).toBeHidden(); // single month
  await expect(page.locator("#tx-body tr")).toHaveCount(9);
  await expect(page.locator("#tx-body tr").first()).toContainText("Ref. 1000000000001");
  await expect(page.locator("#tx-range")).toHaveText("1–9 of 9");
  await expect(page.locator("#pager-buttons button")).toHaveCount(0);

  await expect(page.locator("#download-ext")).toHaveText(".xlsx"); // Excel is the default
  const [xlsx] = await Promise.all([page.waitForEvent("download"), page.click("#download-btn")]);
  expect(xlsx.suggestedFilename()).toBe("gcash-statement_2026-03-01_to_2026-03-31.xlsx");
  const wb = read(readFileSync((await xlsx.path())!));
  expect(wb.SheetNames).toEqual(["Transactions", "Summary"]);
  expect(utils.sheet_to_json(wb.Sheets.Transactions!)).toHaveLength(9);

  await page.getByRole("radio", { name: "CSV" }).check();
  await expect(page.locator("#download-ext")).toHaveText(".csv");
  const [csv] = await Promise.all([page.waitForEvent("download"), page.click("#download-btn")]);
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
  await expect(page.locator("#verify-body .pill-warn")).toHaveCount(1);
  await expect(page.locator("#verify-body tr").nth(3)).toContainText("2 gaps");
  await expect(page.locator("#review")).toBeVisible();
  await expect(page.locator("#review-title")).toHaveText("2 rows need a look");
  await expect(page.locator("#review-body")).toContainText(
    "1 unchanged, 1 moved by a different amount",
  );
  const row5 = page.locator("#tx-body tr").nth(4);
  await expect(row5).toHaveClass(/flagged/);
  await expect(row5).toContainText("₱2,855.00");
  await expect(row5).toContainText("Balance unchanged");
});

test("explains files it can't convert and stays on the first step", async ({ page }) => {
  const cases: [string, RegExp][] = [
    ["not-really", /couldn't be opened as a PDF/],
    ["no-text", /no readable text/],
    ["not-gcash", /doesn't look like a GCash Transaction History/],
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
  await page.getByRole("button", { name: "Page 3" }).click();
  await expect(range).toHaveText("41–45 of 45");
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
  await expect(rows.first()).toContainText("Balance unchanged");
  await page.fill("#tx-search", "no such thing");
  await expect(page.locator("#tx-empty")).toBeVisible();

  // "Show rows to review" jumps to just the flagged rows
  await expect(page.locator("#review-title")).toHaveText("3 rows need a look");
  await page.click("#review-show");
  await expect(page.locator("#tx-search")).toHaveValue("");
  await expect(page.locator('[data-filter="review"]')).toHaveAttribute("aria-pressed", "true");
  await expect(rows).toHaveCount(3);
  await expect(page.locator("#tx-body tr.flagged")).toHaveCount(3);
  await expect(page.locator("#tx-body .col-row")).toHaveText(["8", "9", "31"]);
});

test("try a sample statement: runs the real converter on the bundled FAKE PDF", async ({
  page,
}) => {
  const { requests, problems } = watch(page);
  await page.getByRole("button", { name: "Try a sample statement" }).click();
  await expect(page.locator("#state-done")).toBeVisible();
  await expect(page.locator("#done-summary")).toHaveText(
    "34 transactions · 2026-03-01 to 2026-04-30",
  );
  await expect(page.locator("#review-title")).toHaveText("1 row needs a look");
  await expect(page.locator("#months-body tr")).toHaveCount(2);
  await page.getByRole("button", { name: "View transactions" }).click();
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
