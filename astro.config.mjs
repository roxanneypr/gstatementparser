// @ts-check
import sitemap from "@astrojs/sitemap";
import { defineConfig } from "astro/config";

const PLACEHOLDER_SITE = "https://example.com";
const PLACEHOLDER_EMAIL = "hello@example.com";

// Production domain (canonical URLs, OG tags, robots.txt, sitemap) and public contact email.
// These are public values, so they live in the code; SITE_URL / PUBLIC_CONTACT_EMAIL env vars can
// override them (e.g. a preview domain).
const SITE = (process.env.SITE_URL ?? "https://wallettoexcel.com").replace(/\/$/, "");
const CONTACT_EMAIL = process.env.PUBLIC_CONTACT_EMAIL ?? "hello@wallettoexcel.com";

/**
 * Launch guard: a production deploy (Cloudflare Workers Builds or Pages on the `main` branch, or
 * LAUNCH_CHECK=1) fails if the domain or contact email are still placeholders. Preview and local
 * builds are fine.
 */
const isProductionDeploy =
  process.env.LAUNCH_CHECK === "1" ||
  (process.env.WORKERS_CI === "1" && process.env.WORKERS_CI_BRANCH === "main") ||
  (process.env.CF_PAGES === "1" && process.env.CF_PAGES_BRANCH === "main");
if (isProductionDeploy) {
  const problems = [];
  if (SITE === PLACEHOLDER_SITE) problems.push("SITE_URL is a placeholder");
  if (CONTACT_EMAIL === PLACEHOLDER_EMAIL) problems.push("PUBLIC_CONTACT_EMAIL is a placeholder");
  if (problems.length) {
    throw new Error(`Launch check failed: ${problems.join(", ")}. See README → Deployment.`);
  }
}

/** Dev-only routes (e.g. the PDF debug page). Never injected during `astro build`. */
const devOnlyRoutes = {
  name: "dev-only-routes",
  hooks: {
    /** @param {{ command: string, injectRoute: (r: { pattern: string, entrypoint: string }) => void }} opts */
    "astro:config:setup": ({ command, injectRoute }) => {
      if (command === "dev") {
        injectRoute({ pattern: "/dev/pdf-debug", entrypoint: "./src/dev/pdf-debug.astro" });
      }
    },
  },
};

export default defineConfig({
  site: SITE,
  output: "static",
  trailingSlash: "never",
  build: {
    format: "file", // /privacy.html served as /privacy — clean URLs on Cloudflare Pages
    // Keep CSS and JS as external files so the strict CSP (style-src/script-src 'self') works.
    inlineStylesheets: "never",
  },
  vite: {
    build: { assetsInlineLimit: 0 },
    // pdf.js and SheetJS are loaded with dynamic import(); pre-bundle them when the dev server
    // starts so Vite doesn't re-optimize mid-session (which fails with "504 Outdated Optimize Dep").
    optimizeDeps: { include: ["pdfjs-dist", "xlsx"] },
    define: { "import.meta.env.PUBLIC_CONTACT_EMAIL": JSON.stringify(CONTACT_EMAIL) },
  },
  integrations: [
    devOnlyRoutes,
    sitemap({
      filter: (page) => !page.includes("/404") && !page.includes("/dev/"),
    }),
  ],
});
