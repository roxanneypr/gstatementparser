import { defineConfig, devices } from "@playwright/test";

// Not 4321: that's `astro dev`'s port, and the tests must hit the production build.
const PORT = 4329;

// Runs against the production build (`npm run test:e2e` builds first), served with dist/_headers
// so the Content-Security-Policy is enforced like on Cloudflare Pages.
export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: `http://localhost:${PORT}` },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: `node scripts/serve-dist.mjs dist ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
  },
});
