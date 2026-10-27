# CLAUDE.md — WalletToExcel (MVP)

Brand: **WalletToExcel** (domain target: wallettoexcel.com). The brand name avoids "GCash" on purpose
(trademark), but SEO copy still targets what people search for: "GCash statement to Excel".

## What this project is

A web app that converts a GCash Transaction History PDF into a clean Excel (.xlsx) or CSV file
that the user can open in Excel or Google Sheets.

Target users (Philippines): freelancers, online sellers, small business owners, bookkeepers,
and anyone tracking personal spending.

Core promise: **"Your statement never leaves your device."** All parsing happens in the browser.

## Non-negotiable rules

1. **Client-side only.** The PDF, its password, and the parsed transactions must never be uploaded,
   logged, sent to analytics, or stored on any server. No `fetch`/XHR with statement data. Ever.
2. **No backend for statements.** The site is static. The only server code is `worker/` for
   `/api/vote` (the anonymous one-tap bank request): it stores a bank name from a fixed list plus
   the date in a Durable Object, nothing else, and request logging is off. It must never receive
   statement data, and the converter must never import `src/scripts/vote.ts` (tests enforce this).
3. **Never commit real statements.** Real PDFs go in `samples/private/` which is git-ignored.
   Test fixtures must use fake/anonymized data only.
4. **Not affiliated with GCash.** Do not use the GCash logo or brand colors in a way that implies
   endorsement. Show a short disclaimer in the footer.
5. **Accuracy over cleverness.** If a row can't be parsed confidently, flag it to the user instead of
   guessing. Show a reconciliation check (see below).

## Tech stack

- **Build:** Astro (static output, `output: 'static'`) + TypeScript. Astro uses Vite under the hood.
  Every page ships as pre-rendered HTML (great for SEO); the converter is the only page with
  client-side JS, loaded via a `<script>` in that page (vanilla TS, no UI framework needed).
- **SEO integrations:** `@astrojs/sitemap` for `sitemap.xml`.
- **PDF parsing:** `pdfjs-dist` (supports password-protected PDFs via `getDocument({ data, password })`)
  - Configure the worker via Vite's `?url` import: `import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'`
  - Load pdf.js and SheetJS lazily (dynamic `import()`) only when the user selects a file, so the
    page itself stays fast.
- **Excel export:** SheetJS Community Edition, installed from the official SheetJS CDN tarball as
  described in the SheetJS docs (do NOT use the outdated `xlsx` package on the npm registry).
  ExcelJS is an acceptable alternative.
- **CSV export:** generate manually with proper escaping; prepend a UTF-8 BOM so Excel shows ₱ and ñ correctly.
- **Tests:** Vitest
- **Lint/format:** ESLint + Prettier
- **Hosting:** Cloudflare Workers with static assets only (free tier), built by Workers Builds from
  GitHub; config in `wrangler.jsonc`. (Cloudflare Pages also works; the launch guard supports both.)
- **Analytics:** no script on the site. Use Cloudflare's server-side traffic analytics (domain →
  Analytics & Logs) and Google Search Console (verified via DNS TXT). HTML pages send
  `Cache-Control: … no-transform` (public/_headers) so Cloudflare can't inject scripts such as its
  automatic Web Analytics beacon. Any future analytics script must never run on the converter
  page, and the privacy page must be updated first.

Reference implementation worth studying (MIT licensed): `gcash-pdf-parser` on npm /
github.com/KazeFreeze/gcash-pdf-parser. If any code is adapted from it, keep its license notice.

## Project structure

```
/
├── CLAUDE.md
├── astro.config.mjs          # site URL, sitemap integration, static output
├── public/
│   ├── _headers              # Cloudflare Pages security headers (CSP etc.)
│   ├── robots.txt
│   ├── favicon.svg
│   └── og-image.png          # 1200x630 social share image
├── src/
│   ├── layouts/
│   │   └── BaseLayout.astro  # <head>: title, meta description, canonical, OG/Twitter tags, JSON-LD
│   ├── components/
│   │   ├── Seo.astro         # reusable SEO head tags (props: title, description, image, schema)
│   │   └── Converter.astro   # the upload/convert UI markup + client script
│   ├── pages/
│   │   ├── index.astro       # converter landing page (main keyword target)
│   │   ├── about.astro
│   │   ├── blog/             # [...index].astro (list) + [slug].astro (post)
│   │   ├── privacy.astro
│   │   └── 404.astro
│   ├── content/
│   │   └── blog/             # Markdown posts (drafts until verified)
│   ├── scripts/
│   │   └── converter.ts      # UI wiring for the converter
│   ├── styles/global.css
│   ├── pdf/
│   │   └── extractText.ts    # pdf.js: load (with password), return positioned text items per page
│   ├── parsers/
│   │   ├── types.ts          # Transaction, ParseResult, StatementParser interface
│   │   ├── gcash.ts          # GCash Transaction History parser
│   │   ├── maya.ts           # Maya Wallet Statement of Account parser
│   │   ├── reconcile.ts      # shared reconciliation checks (every parser uses it)
│   │   └── index.ts          # registry: detect which parser fits a PDF
│   ├── export/
│   │   ├── toXlsx.ts
│   │   └── toCsv.ts
│   └── lib/
│       ├── money.ts          # parse "1,234.56" -> centavos (integer); never use floats for sums
│       └── dates.ts          # normalize dates to ISO YYYY-MM-DD and keep time if present
├── tests/
│   ├── fixtures/             # anonymized text-item fixtures (JSON), not real PDFs
│   └── gcash.test.ts
└── samples/private/          # git-ignored, real PDFs for local manual testing only
```

## Data model

```ts
// Source of truth: src/parsers/types.ts (keep this section in sync with it).

interface TextItem {
  str: string;
  x: number;
  y: number; // baseline, measured from the TOP of the page (grows downward)
  width: number;
  height: number;
  fontName?: string;
}

interface PageText {
  pageNumber: number;
  width: number;
  height: number;
  items: TextItem[];
}

interface Transaction {
  date: string; // ISO date, e.g. "2026-03-14"
  time?: string; // "13:05" (24-hour) if available
  description: string;
  referenceNo?: string;
  debit: number; // centavos, >= 0
  credit: number; // centavos, >= 0
  balance?: number; // centavos, running balance exactly as printed
  raw?: string; // original line(s), for debugging / flagged rows
  flags?: string[]; // problems READING this row (missing date, ambiguous amounts, ...)
  balanceIssue?: BalanceIssue; // set when this row's balance doesn't follow from the previous row
}

interface BalanceIssue {
  // "unchanged": balance stayed the same despite the transaction;
  // "different": balance moved by a different amount than the transaction.
  kind: "unchanged" | "different";
  difference: number; // centavos: balance − (previous balance + credit − debit)
}

interface ParseResult {
  source: "gcash" | "maya";
  accountName?: string;
  accountNumber?: string; // mask in UI: show only last 4 digits
  periodStart?: string;
  periodEnd?: string;
  openingBalance?: number;
  closingBalance?: number;
  statementTotals?: { debit?: number; credit?: number }; // totals printed on the statement
  cleanedUp?: { removed: number }; // set when the user turned on "Clean up" (see below)
  transactions: Transaction[];
  // Statement-level problems only (unplaced text, missing balances, totals mismatch, ...).
  // Row-level problems live on each Transaction (`flags`, `balanceIssue`).
  warnings: string[];
  checks: ReconciliationChecks;
}

// Each check is `null` when the statement doesn't give enough information to run it.
interface ReconciliationChecks {
  totalsMatchStatement: boolean | null; // parsed sums = statement's "Total Debit"/"Total Credit"
  runningBalanceOk: boolean | null; // every row: previous balance + credit − debit = balance
  openingToClosingOk: boolean | null; // opening + credits − debits = closing
}

interface StatementParser {
  id: string;
  label: string;
  canParse(pages: PageText[]): boolean;
  parse(pages: PageText[]): ParseResult;
}
```

**Clean up (opt-in, off by default):** a checkbox above the transactions removes rows whose
balance didn't change (`balanceIssue.kind === "unchanged"`) from the view, totals and downloads
(`src/lib/cleanUp.ts`); the Excel Summary sheet records how many were removed. The done card's
status line only says "Every running balance matches" when that is true.

**Never alter the statement's figures.** A `balanceIssue` describes a gap; it doesn't "fix" it. Real
GCash statements do contain such gaps (e.g. a payment listed while the balance stays the same),
so the UI shows them as rows to review, and the exports add a "Balance check" column.

The parser registry exists so we can add Maya, BPI, BDO, SeaBank, etc. later without touching the UI.

## Parsing approach

1. Use pdf.js `getTextContent()` per page; keep each item's `str`, `x`, `y`.
2. Group items into rows by `y` (with a small tolerance), sort each row by `x`.
3. Detect the transaction table header row to learn column x-positions
   (date, description, reference no., debit, credit, balance).
4. Assign each item to a column by x-position. Descriptions can wrap to multiple lines:
   a row with no date that follows a transaction row is a continuation of its description.
5. Skip repeated page headers/footers and summary lines.
6. Parse money into integer centavos. Parse dates into ISO.
7. **Reconciliation check:** if opening/closing balances or running balances are available, verify
   `opening + credits − debits = closing`, that parsed totals match the statement's own totals, and
   that each running balance follows from the previous one. Record results in `checks`; record each
   running-balance gap as a `balanceIssue` on the row (highlighted in the preview, labelled in the
   exports). Totals matching while balances don't usually means the extraction is right and the gap
   is in the statement itself.

The exact GCash layout is NOT known in advance. Before writing the parser, ask the user to place a real
statement in `samples/private/` and run a debug script that dumps text items with coordinates to the
console (never to a committed file). Build anonymized fixtures from that structure.

Password handling: GCash statements are password-protected. Prompt the user for the password in the UI.
Catch pdf.js `PasswordException` and show a friendly "wrong password, try again" message.
Never store the password (no localStorage, no URL params).

## UI requirements (MVP)

- One page, mobile-first (most users are on phones).
- Drag-and-drop or tap-to-select PDF → password field → "Convert".
- Preview table (first ~50 rows) with totals: total in, total out, net, transaction count.
- Warnings panel for flagged rows / reconciliation issues.
- Buttons: **Download Excel (.xlsx)**, **Download CSV**, and a short "How to open in Google Sheets" tip
  (File → Import → Upload).
- Excel output: sheet "Transactions" (frozen header, peso number format `₱#,##0.00`, date column as real
  dates, autofilter) and sheet "Summary" (period, totals, transaction count, monthly in/out).
- Clear privacy note near the upload box: "Processed on your device. Nothing is uploaded." Say it
  once on the home page (not in a badge + feature + note); repetition reads as defensive.
- The converter card shows an "Example output" (sample rows in real statement wording, never
  invented labels like "Buy Load" unless verified) and a "Try a sample statement" button that runs
  the real converter on the FAKE `public/sample/sample-gcash-statement.pdf`.
- Header "Convert PDF" button on every page. On the home page it is an in-page anchor (`#convert`)
  that scrolls to and focuses the converter; it must never reload the page (that wipes results).
- Mobile first: the main button must be visible without scrolling at 360×500 (Facebook in-app
  browser); "drag and drop" copy only on devices with a mouse. Don't promise "no limits" (a paid
  tier is on the roadmap); say "Free to use".
- Footer: disclaimer (not affiliated with GCash), link to privacy page, contact email.
- Pages: home (converter), about, blog, privacy, 404. Footer: About · Blog · Privacy · Contact.
  The blog (and its footer link) only exists once at least one post is published.
- Languages: English first; keep UI strings in one object so Filipino/Taglish can be added later.
- Accessible: labels on inputs, keyboard usable, good contrast.
- Light theme only (no dark mode). Design direction: minimal, premium fintech. Inter (self-hosted),
  near-black ink and black pill buttons, one accent (spreadsheet green), hairline dividers, generous
  whitespace, and a subtle "wallet → spreadsheet" motif. No GCash brand colours.

## SEO requirements

SEO is the main growth channel, so build it in from the start. Users search in plain English and
Taglish, e.g. "gcash transaction history to excel", "how to download gcash transaction history",
"gcash statement password", "gcash pdf to google sheets".

### Every page must have

- A unique `<title>` (≤ 60 chars) and meta description (≤ 155 chars) written for humans.
- Exactly one `<h1>`; logical `h2`/`h3` structure.
- `<link rel="canonical">` with the absolute URL (set `site` in `astro.config.mjs`).
- `<html lang="en">` (or `lang="fil"` for Filipino pages).
- Open Graph + Twitter Card tags (title, description, `og:image`, `og:url`, `og:type`) — links are
  shared heavily on Facebook and Messenger in the PH, so previews must look good.
- Descriptive `alt` text on images; descriptive link text (no "click here").

### Landing page (`/`)

- Title example: "GCash Statement to Excel – Free & Private | WalletToExcel" (keyword first, brand last).
- The converter is above the fold, but the page also has real crawlable text below it:
  the feature columns and a compact FAQ (4 questions, collapsed, `src/data/faq.ts`) in plain HTML.
  (No "How it works" or "Who it's for" sections: removed by product decision, 2026-10-26.)
- JSON-LD: `WebApplication` (name, url, applicationCategory: "FinanceApplication",
  operatingSystem: "Any", offers price 0 PHP) and `FAQPage` for the FAQ.
- The core content must be in the static HTML, never injected only by JavaScript.

### Blog (`/blog/<slug>`)

Each post answers one specific search question and links to the converter with a clear call to
action. Content collection fields: `title`, `description`, `publishedDate`, `updatedDate`, `lang`,
`draft`, `related`. JSON-LD `BlogPosting` + `BreadcrumbList`. Posts start as drafts: do NOT
invent GCash app menu paths, passwords, fees, or BIR rules; mark anything unverified with
`TODO: verify` (the build refuses to publish a post that still has TODOs).

### Future bank pages

When new parsers are added, each gets its own landing page (`/bpi-statement-to-excel`,
`/maya-statement-to-excel`, etc.) generated from a single data file, with unique copy per page
(no duplicate boilerplate).

### Technical

- `sitemap.xml` via `@astrojs/sitemap` (exclude drafts and 404); reference it in `robots.txt`.
- `robots.txt` allows all crawlers; disallow nothing important.
- Performance targets (Lighthouse mobile): Performance ≥ 95, SEO = 100, Accessibility ≥ 95.
  Keep heavy libs lazy-loaded; use system fonts or one self-hosted font; compress images (WebP/AVIF).
- Clean, lowercase, hyphenated URLs; no trailing query params for content.
- Custom `404.astro` that links back to the converter.
- Redirect `www` ↔ apex to one canonical host (configure in Cloudflare).

### After launch (human tasks, document them in README)

- Verify the domain in Google Search Console and Bing Webmaster Tools; submit `sitemap.xml`.
- Check indexing and search queries monthly; improve the home page title/description if it gets impressions but few clicks.

## Security headers (`public/_headers`)

Set for `/*`: a strict Content-Security-Policy (`default-src 'self'`, allow `worker-src 'self' blob:`
as pdf.js needs, `connect-src 'self'` plus the analytics endpoint only if analytics is enabled),
`X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`,
`Permissions-Policy` disabling camera/microphone/geolocation. JSON-LD blocks
(`type="application/ld+json"`) are data, not executable scripts, so they don't need a CSP exception.
Make sure Astro's own scripts are emitted as external files (not inline) so `script-src 'self'` works,
and verify the built site shows no CSP errors in the browser console.

## Commands

```bash
npm install
npm run dev        # local dev server
npm run test       # vitest
npm run lint
npm run build      # astro build, outputs static site to dist/
npm run preview    # serve the production build locally
```

## Deployment (Cloudflare Pages)

- Repo on GitHub → Cloudflare dashboard → Workers & Pages → Create → connect the repo.
- Framework preset: Astro. Build command: `npm run build`. Output directory: `dist`.
- Set `NODE_VERSION` env var to the current Node LTS if the build image default is too old.
- Every push to `main` deploys to production; pull requests get preview URLs.
- Custom domain: Pages project → Custom domains → add the domain (automatic if the domain uses
  Cloudflare DNS).
- Optional CLI deploy: `npx wrangler pages deploy dist --project-name=<name>`.

## Coding conventions

- TypeScript strict mode. No `any` in parser code.
- SEO checks are part of "done": every new page has title, description, canonical, OG tags, and
  appears in the sitemap.
- Pure functions in `parsers/`, `export/`, `lib/` so they are unit-testable without a browser.
- Money is always integer centavos internally; format only at display/export time.
- Keep dependencies minimal; justify any new one.
- Every parser bug fix gets a regression test with an anonymized fixture.

## Roadmap (not in MVP — do not build unless asked)

1. Auto-categorization (Send Money, Cash In, Bills, Load, Shopping, etc.) with user-editable rules
2. Multiple statements merged into one workbook; duplicate detection
3. More sources: Maya, BPI, BDO, SeaBank, UnionBank (each as a new `StatementParser`)
4. Freemium limits + accounts (Supabase) + payments via PayMongo or HitPay (GCash/Maya)
5. Bookkeeper features: batch upload, BIR-friendly income summaries
6. Google Sheets direct export (requires Google OAuth + app verification)
