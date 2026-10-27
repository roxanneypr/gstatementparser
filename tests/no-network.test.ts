import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Guard for the core promise: app code must never make network requests. (pdf.js is given the
// file bytes directly, so it never fetches either; the e2e tests verify this in a real browser.)
const NETWORK_APIS =
  /\b(fetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|RTCPeerConnection|navigator\.serviceWorker|importScripts)\b/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

describe("no network access in app code", () => {
  const sources = files("src").filter((f) => /\.(ts|astro|mjs|js)$/.test(f));

  it("scans the app sources", () => {
    expect(sources.length).toBeGreaterThan(10);
  });

  it.each(sources)("%s makes no network calls", (file) => {
    let code = readFileSync(file, "utf8").replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, "");
    // Single allowed exception: the converter GETs the FAKE sample statement from our own site.
    if (file.endsWith(join("scripts", "converter.ts"))) {
      expect(code).toMatch(/const SAMPLE_URL = "\/sample\/[a-z0-9-]+\.pdf";/);
      expect(code.match(/fetch\(/g)).toHaveLength(1);
      code = code.replace("fetch(SAMPLE_URL)", "");
    }
    // Second exception: the anonymous bank vote. One POST to our own /api/vote with only the bank
    // name, from a script that can't see statement data (no converter/parser/pdf imports).
    if (file.endsWith(join("scripts", "vote.ts"))) {
      expect(code).toMatch(/const VOTE_URL = "\/api\/vote";/);
      expect(code.match(/fetch\(/g)).toHaveLength(1);
      expect(code).toMatch(/body: JSON\.stringify\(\{ bank \}\)/);
      expect(code).not.toMatch(/from "\.\.\/(pdf|parsers|export|lib)\//);
      code = code.replace("fetch(VOTE_URL", "");
    }
    expect(code).not.toMatch(NETWORK_APIS);
  });

  it("the converter never loads the vote script", () => {
    const converter = readFileSync(join("src", "scripts", "converter.ts"), "utf8");
    expect(converter).not.toMatch(/vote/);
  });

  it("CSP blocks connections to other origins", () => {
    const headers = readFileSync("public/_headers", "utf8");
    expect(headers).toMatch(/connect-src 'self'[;\n]/);
    expect(headers).toMatch(/default-src 'self'/);
    expect(headers).toMatch(/form-action 'none'/);
  });

  it("HTML pages tell Cloudflare not to modify them (no injected scripts)", () => {
    const headers = readFileSync("public/_headers", "utf8");
    for (const path of ["/", "/about", "/privacy", "/blog", "/blog/*"]) {
      const rule = new RegExp(
        `^${path.replace(/[*/]/g, "\\$&")}\\n\\s+Cache-Control:[^\\n]*no-transform`,
        "m",
      );
      expect(headers, path).toMatch(rule);
    }
  });
});
