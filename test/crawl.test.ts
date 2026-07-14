import { existsSync, readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import {
  crawlDomains,
  offlineLoader,
  parseDomainsFile,
  renderIndexHtml,
  writeIndex,
} from "../src/crawl.js";

const fixturesDir = fileURLToPath(new URL("./fixtures", import.meta.url));
const offlineDir = path.join(fixturesDir, "offline");
const NOW = new Date("2026-07-01T00:00:00Z");

const tempDirs: string[] = [];
afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

describe("parseDomainsFile", () => {
  it("strips comments, blanks, and duplicates", () => {
    const text = "# header\nexample.com\n\nexample.com\nacme.dev # inline\n  \n";
    expect(parseDomainsFile(text)).toEqual(["example.com", "acme.dev"]);
  });
});

describe("crawlDomains (offline)", () => {
  it("aggregates valid, invalid, and unreachable domains", async () => {
    const domains = parseDomainsFile(
      readFileSync(path.join(offlineDir, "domains.txt"), "utf8"),
    );
    expect(domains).toEqual([
      "example.com",
      "mcp.acme.example",
      "plaintext.example.net",
      "ghost.example.org",
    ]);

    const index = await crawlDomains(domains, offlineLoader(offlineDir), { now: NOW });

    expect(index.generated_at).toBe("2026-07-01T00:00:00Z");
    expect(index.total).toBe(4);
    expect(index.reachable).toBe(3);
    expect(index.valid).toBe(2);

    const byDomain = new Map(index.entries.map((e) => [e.domain, e]));

    const ok = byDomain.get("mcp.acme.example")!;
    expect(ok.ok).toBe(true);
    expect(ok.valid).toBe(true);
    expect(ok.url).toBe("https://mcp.acme.example/.well-known/mcp.json");
    expect(ok.summary?.servers).toHaveLength(2);

    const invalid = byDomain.get("plaintext.example.net")!;
    expect(invalid.ok).toBe(true);
    expect(invalid.valid).toBe(false);
    expect(invalid.errors).toBeGreaterThan(0);
    // schema-valid but semantically invalid: summary still available
    expect(invalid.summary?.name).toBe("Plaintext Publisher");

    const missing = byDomain.get("ghost.example.org")!;
    expect(missing.ok).toBe(false);
    expect(missing.error).toMatch(/no offline document/);
    expect(missing.summary).toBeUndefined();
  });

  it("flags syntactically invalid domains without crashing", async () => {
    const index = await crawlDomains(["bad domain!"], offlineLoader(offlineDir), {
      now: NOW,
    });
    expect(index.entries[0]!.ok).toBe(false);
    expect(index.entries[0]!.error).toMatch(/invalid domain/);
  });
});

describe("renderIndexHtml", () => {
  it("renders a self-contained page with all domains", async () => {
    const domains = parseDomainsFile(
      readFileSync(path.join(offlineDir, "domains.txt"), "utf8"),
    );
    const index = await crawlDomains(domains, offlineLoader(offlineDir), { now: NOW });
    const html = renderIndexHtml(index);

    expect(html).toContain("<!doctype html>");
    expect(html).toContain("MCP .well-known index");
    expect(html).toContain("example.com");
    expect(html).toContain("ghost.example.org");
    expect(html).toContain("Acme Developer Platform");
    expect(html).not.toContain("<script");
  });

  it("escapes HTML in crawled content", async () => {
    const loader = async () => ({
      name: '<img src=x onerror=alert(1)>"pwn"',
      spec_version: "2025-06-18",
      servers: [
        {
          name: "x<script>",
          endpoint: "https://mcp.example.com/mcp",
          transport: "streamable-http",
        },
      ],
      updated_at: "2026-06-01T12:00:00Z",
    });
    const index = await crawlDomains(["evil.example.com"], loader, { now: NOW });
    const html = renderIndexHtml(index);
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("x<script>");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });
});

describe("writeIndex", () => {
  it("writes index.json and index.html", async () => {
    const outDir = mkdtempSync(path.join(tmpdir(), "mcp-wellknown-crawl-"));
    tempDirs.push(outDir);
    const index = await crawlDomains(["example.com"], offlineLoader(offlineDir), {
      now: NOW,
    });
    const { jsonPath, htmlPath } = writeIndex(index, outDir);

    expect(existsSync(jsonPath)).toBe(true);
    expect(existsSync(htmlPath)).toBe(true);

    const parsed = JSON.parse(readFileSync(jsonPath, "utf8"));
    expect(parsed.total).toBe(1);
    expect(parsed.entries[0].domain).toBe("example.com");
    expect(readFileSync(htmlPath, "utf8")).toContain("Example Corp");
  });
});
