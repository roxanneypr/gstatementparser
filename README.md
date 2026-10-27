# WalletToExcel

GCash statement to Excel converter.
Convert a GCash Transaction History PDF into a clean Excel (.xlsx) or CSV file, entirely in the
browser. **The statement, its password and the transactions never leave the user's device.**

Static site built with Astro + TypeScript, deployed to Cloudflare Pages. See [CLAUDE.md](CLAUDE.md)
for the full product and engineering rules.

## Quick start

```bash
npm install
npm run dev          # http://localhost:4321 (drafts and the PDF debug page are visible here)
npm run test         # unit tests (Vitest)
npm run lint
npm run build        # astro check + static build to dist/
npm run preview      # serve the production build
npm run test:e2e     # build, then Playwright tests in a real browser with production headers
npm run test:all     # lint + unit + e2e
```

First time running e2e tests: `npx playwright install chromium`.

## How it works

1. `src/pdf/extractText.ts` opens the PDF with pdf.js (with the password, in memory) and returns
   positioned text items per page.
2. `src/parsers/` detects the statement type and parses it. The GCash parser anchors each
   transaction on its reference number, which handles descriptions that wrap above and below the
   amounts line.
3. Reconciliation: totals vs the statement's own Total Debit/Credit, each running balance vs the
   previous row, and starting + credits − debits = ending. Gaps are shown to the user, **never
   "fixed"**. Figures are always kept exactly as printed.
4. `src/export/` builds the .xlsx (SheetJS, lazy-loaded) and CSV (UTF-8 BOM, formula-injection safe).

Money is always integer centavos internally.

## Working with real statements (locally only)

Put real PDFs in `samples/private/`. It is git-ignored, as is every `*.pdf`. Never commit them.

```bash
# Dump text items with coordinates (digits redacted unless --raw)
PDF_PASSWORD='…' npm run dump-pdf -- samples/private/statement.pdf

# Run the parser and print counts, checks and warnings (digits redacted unless --raw)
PDF_PASSWORD='…' npm run check-parse -- samples/private/statement.pdf
```

There is also a browser debug page at `/dev/pdf-debug` (only exists under `npm run dev`).

Test fixtures in `tests/fixtures/` are **synthetic** data that mirror the real layout. Every parser
bug fix gets a regression test with an anonymised fixture. The e2e tests turn fixtures into fake
PDFs at run time (`scripts/fake-pdf.mjs`).

## Blog

Posts live in `src/content/blog/*.md` (frontmatter: `title` ≤ 60 chars, `description` ≤ 155,
`publishedDate`, optional `updatedDate`, `lang`, `draft`, `related`). New posts start as
`draft: true`.

- **Hidden until the first post is published.** With no published posts, production has no
  `/blog` page, no footer link and no sitemap entry. Drafts render only in `npm run dev`
  (with a Draft banner and `noindex`).
- **The build fails** if a published post still contains `TODO`, uses a `# ` heading (the title is
  the only `<h1>`), or links (via `related` or `/blog/...`) to a post that isn't published.

To publish: check every `TODO: verify` against official GCash sources, add any screenshots using
the fake statement only (`scripts/fake-statement.mjs`), then set `draft: false`.

## Deployment (Cloudflare Workers, static assets)

The site is deployed as a Cloudflare **Worker with static assets only** (no server code), built by
**Workers Builds** from GitHub. `wrangler.jsonc` sets the asset folder (`dist`), the custom 404 page
and clean URLs; `public/_headers` sets the CSP and security headers.

1. Cloudflare dashboard → **Workers & Pages** → the `wallettoexcel` Worker → **Settings → Build**:
   - Git repository: `roxanneypr/gstatementparser`, production branch `main`
   - Build command: `npm run build` · Deploy command: `npx wrangler deploy`
2. **Domain and contact email** are set in code (`astro.config.mjs`): `https://wallettoexcel.com` and
   `hello@wallettoexcel.com`. Build variables `SITE_URL` / `PUBLIC_CONTACT_EMAIL` (Settings → Build →
   Variables and secrets) override them, e.g. for a preview domain. Node comes from `.nvmrc`.

   **Launch guard:** builds of `main` fail if either is ever set back to a placeholder
   (`example.com`); a failed build leaves the previous deployment live.

3. Every push to `main` deploys to production.
4. Check a config change without deploying: `npm run build && npx wrangler deploy --dry-run`.

### Custom domain

1. Worker → **Settings → Domains & Routes → Add → Custom domain**. If the domain's DNS is on
   Cloudflare, records are created automatically.
2. Pick one canonical host (e.g. the apex `example.ph`) and redirect the other (`www`) to it:
   Rules → **Redirect Rules** → "Redirect from WWW to root" template (301, preserve path and query).
3. Domain → **SSL/TLS → Edge Certificates → Always Use HTTPS**: on.
4. Update `SITE_URL` to the canonical host and redeploy.
5. Keep **Rocket Loader** off (domain → Speed → Settings): it rewrites scripts and breaks the CSP.

### Optional: Cloudflare Web Analytics

Cookieless page views only, never file data. If enabled, update the CSP in `public/_headers`:
add `https://static.cloudflareinsights.com` to `script-src` and `https://cloudflareinsights.com`
to `connect-src`, and update the analytics section of `src/pages/privacy.astro` **before**
enabling it.

## After launch: search engines

1. **Google Search Console** (search.google.com/search-console) → Add property → **Domain**
   property → verify with the DNS TXT record (add it in Cloudflare DNS).
2. Sitemaps → submit `https://<your-domain>/sitemap-index.xml`.
3. URL Inspection → test the home page → **Request indexing**.
4. **Bing Webmaster Tools** (bing.com/webmasters) → Import from Google Search Console (fastest),
   or add the site and verify by DNS. Submit the same sitemap.
5. Share the home page once on Facebook/Messenger and check the preview with the Facebook
   Sharing Debugger (developers.facebook.com/tools/debug).

**Monthly:** check Search Console → Pages (indexing problems) and Performance (queries).
Improve the home page title/description if it gets impressions but few clicks.

## Privacy verification

- `tests/no-network.test.ts` fails if app code uses `fetch`, XHR, `sendBeacon`, WebSockets, etc.
  The one allowed exception is a same-origin GET of the fake sample statement.
- `e2e/converter.spec.ts` converts a statement and downloads both files in a real browser with
  the production CSP, and asserts that every request is a same-origin GET with no body, and that
  there are no CSP violations or console errors.
- The CSP (`connect-src 'self'`, `form-action 'none'`) blocks sending data elsewhere even if a
  bug were introduced.

## Regenerating assets

```bash
node scripts/make-icons.mjs        # favicon.ico + app icons from public/favicon.svg (the logo)
node scripts/make-og-image.mjs     # public/og-image.png (1200x630 share image)
node scripts/make-sample-pdf.mjs   # public/sample/sample-gcash-statement.pdf ("Try a sample statement"; FAKE data)
npm run build && node scripts/make-blog-screenshots.mjs   # blog screenshots from the FAKE sample
```

## Credits

- [pdf.js](https://github.com/mozilla/pdf.js) (Apache-2.0)
- [SheetJS Community Edition](https://sheetjs.com) (Apache-2.0), installed from the SheetJS CDN
- [Inter](https://github.com/rsms/inter) font (SIL OFL 1.1, see `public/fonts/OFL.txt`), self-hosted

Not affiliated with, endorsed by, or sponsored by GCash, G-Xchange, Inc., or Mynt.
