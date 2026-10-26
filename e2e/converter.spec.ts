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
  await expect(page.locator("#stat-in")).toHaveText("₱12,505.00");
  await expect(page.locator("#stat-out")).toHaveText("₱2,983.50");
  await expect(page.locator("#checks .check-ok")).toHaveCount(3);
  await expect(page.locator("#warnings")).toBeHidden();
  await expect(page.locator("#preview-body tr")).toHaveCount(9);

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
  await expect(page.locator("#checks .check-warn")).toHaveCount(1);
  await expect(page.locator("#warnings")).toBeVisible();
  await expect(page.locator("#warnings summary").first()).toHaveText(
    "The balance didn't change after 1 transaction",
  );
  const row5 = page.locator("#preview-body tr").nth(4);
  await expect(row5).toHaveClass(/flagged/);
  await expect(row5).toContainText("₱2,855.00");
  await expect(row5).toContainText("Balance didn't change");
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
  await expect(page.locator("#warnings")).toBeVisible();
});

test("explains when the converter code can't load (e.g. stale cache, offline)", async ({
  page,
}) => {
  await page.route(/extractText.*\.js/, (route) => route.abort());
  await page.setInputFiles("#pdf-file", pdf("clean"));
  await expect(page.locator("#error")).toHaveText(/couldn't finish loading.*refresh the page/);
  await expect(page.locator("#state-idle")).toBeVisible();
});
