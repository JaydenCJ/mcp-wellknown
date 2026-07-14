import { mkdirSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { fetchJson, type FetchJsonOptions } from "./fetch.js";
import {
  summarizeDocument,
  wellKnownUrl,
  type DocumentSummary,
} from "./inspect.js";
import { validateDocument } from "./validate.js";
import type { McpWellKnownDocument } from "./types.js";

/** Resolves a domain to its (parsed) discovery document, or throws. */
export type DocumentLoader = (domain: string) => Promise<unknown>;

export interface CrawlEntry {
  domain: string;
  url: string;
  /** True when a JSON document could be retrieved at all. */
  ok: boolean;
  /** Retrieval error when ok=false. */
  error?: string;
  /** True when the document passed schema + semantic validation. */
  valid?: boolean;
  errors?: number;
  warnings?: number;
  /** Present when the document at least matched the schema. */
  summary?: DocumentSummary;
}

export interface CrawlIndex {
  generated_at: string;
  total: number;
  reachable: number;
  valid: number;
  entries: CrawlEntry[];
}

/** Parse a domains.txt file: one domain per line, `#` comments and blanks ignored. */
export function parseDomainsFile(text: string): string[] {
  const domains: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.replace(/#.*$/, "").trim();
    if (trimmed !== "") domains.push(trimmed);
  }
  return [...new Set(domains)];
}

/** Loader that fetches https://<domain>/.well-known/mcp.json. */
export function httpLoader(options: FetchJsonOptions = {}): DocumentLoader {
  return (domain) => fetchJson(wellKnownUrl(domain), options);
}

/**
 * Offline loader for tests, CI, and local demos: reads `<dir>/<domain>.json`
 * instead of touching the network.
 */
export function offlineLoader(dir: string): DocumentLoader {
  return async (domain) => {
    const file = path.join(dir, `${domain}.json`);
    let raw: string;
    try {
      raw = await readFile(file, "utf8");
    } catch {
      throw new Error(`no offline document at ${file}`);
    }
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      throw new Error(`${file} is not valid JSON`);
    }
  };
}

export interface CrawlOptions {
  /** Reference time for validation and the generated_at stamp. */
  now?: Date;
}

/** Crawl a list of domains and build the index consumed by the static site. */
export async function crawlDomains(
  domains: string[],
  loader: DocumentLoader,
  options: CrawlOptions = {},
): Promise<CrawlIndex> {
  const now = options.now ?? new Date();
  const entries: CrawlEntry[] = [];

  for (const domain of domains) {
    let url: string;
    try {
      url = wellKnownUrl(domain);
    } catch (err) {
      entries.push({
        domain,
        url: "",
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    let data: unknown;
    try {
      data = await loader(domain);
    } catch (err) {
      entries.push({
        domain,
        url,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    const result = validateDocument(data, { now });
    entries.push({
      domain,
      url,
      ok: true,
      valid: result.valid,
      errors: result.errors.length,
      warnings: result.warnings.length,
      ...(result.schemaValid
        ? { summary: summarizeDocument(data as McpWellKnownDocument) }
        : {}),
    });
  }

  return {
    generated_at: now.toISOString().replace(/\.\d{3}Z$/, "Z"),
    total: entries.length,
    reachable: entries.filter((e) => e.ok).length,
    valid: entries.filter((e) => e.valid === true).length,
    entries,
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function statusBadge(entry: CrawlEntry): string {
  if (!entry.ok) return '<span class="badge err">unreachable</span>';
  if (entry.valid) return '<span class="badge ok">valid</span>';
  return '<span class="badge warn">invalid</span>';
}

function serverRows(entry: CrawlEntry): string {
  if (!entry.summary) return "";
  return entry.summary.servers
    .map(
      (server) => `
        <div class="server">
          <code>${escapeHtml(server.name)}</code>
          <span class="meta">${escapeHtml(server.transport)} · auth: ${escapeHtml(server.auth)}</span>
          <div class="caps">${
            server.capabilities.length > 0
              ? escapeHtml(server.capabilities.join("; "))
              : "no capabilities declared"
          }</div>
        </div>`,
    )
    .join("");
}

/** Render the crawl index as a self-contained static HTML page. */
export function renderIndexHtml(index: CrawlIndex): string {
  const rows = index.entries
    .map(
      (entry) => `
      <tr>
        <td>
          <strong>${escapeHtml(entry.domain)}</strong>
          ${entry.summary ? `<div class="publisher">${escapeHtml(entry.summary.name)}</div>` : ""}
          ${entry.error ? `<div class="error">${escapeHtml(entry.error)}</div>` : ""}
        </td>
        <td>${statusBadge(entry)}</td>
        <td>${entry.summary ? escapeHtml(entry.summary.spec_version) : "—"}</td>
        <td>${serverRows(entry) || "—"}</td>
        <td>${entry.summary?.updated_at ? escapeHtml(entry.summary.updated_at) : "—"}</td>
      </tr>`,
    )
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>MCP .well-known index</title>
<style>
  :root { color-scheme: light dark; --fg: #1c1c1e; --bg: #ffffff; --muted: #6b7280; --line: #e5e7eb; --ok: #15803d; --warn: #b45309; --err: #b91c1c; }
  @media (prefers-color-scheme: dark) { :root { --fg: #e5e7eb; --bg: #111214; --muted: #9ca3af; --line: #2d2f34; --ok: #4ade80; --warn: #fbbf24; --err: #f87171; } }
  body { margin: 2rem auto; max-width: 64rem; padding: 0 1rem; font: 15px/1.55 system-ui, sans-serif; color: var(--fg); background: var(--bg); }
  h1 { font-size: 1.4rem; }
  .sub { color: var(--muted); margin-bottom: 1.5rem; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; vertical-align: top; padding: 0.6rem 0.75rem; border-bottom: 1px solid var(--line); }
  th { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); }
  code { font-family: ui-monospace, monospace; font-size: 0.9em; }
  .badge { font-size: 0.75rem; font-weight: 600; padding: 0.1rem 0.5rem; border-radius: 999px; border: 1px solid currentColor; }
  .badge.ok { color: var(--ok); } .badge.warn { color: var(--warn); } .badge.err { color: var(--err); }
  .publisher { color: var(--muted); font-size: 0.85rem; }
  .error { color: var(--err); font-size: 0.85rem; }
  .server { margin-bottom: 0.5rem; }
  .server .meta { color: var(--muted); font-size: 0.85rem; margin-left: 0.4rem; }
  .server .caps { color: var(--muted); font-size: 0.85rem; }
  footer { margin-top: 1.5rem; color: var(--muted); font-size: 0.85rem; }
  a { color: inherit; }
</style>
</head>
<body>
<h1>MCP .well-known index</h1>
<p class="sub">${index.total} domain(s) crawled · ${index.reachable} reachable · ${index.valid} valid — generated by <a href="https://github.com/mcp-wellknown/mcp-wellknown">mcp-wellknown</a></p>
<table>
  <thead>
    <tr><th>Domain</th><th>Status</th><th>Spec</th><th>Servers &amp; capabilities</th><th>Updated</th></tr>
  </thead>
  <tbody>
${rows}
  </tbody>
</table>
<footer>Generated at ${escapeHtml(index.generated_at)}. Data is self-declared by each domain at <code>/.well-known/mcp.json</code>.</footer>
</body>
</html>
`;
}

export interface WriteIndexResult {
  jsonPath: string;
  htmlPath: string;
}

/** Write index.json and index.html into the output directory. */
export function writeIndex(index: CrawlIndex, outDir: string): WriteIndexResult {
  mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, "index.json");
  const htmlPath = path.join(outDir, "index.html");
  writeFileSync(jsonPath, `${JSON.stringify(index, null, 2)}\n`);
  writeFileSync(htmlPath, renderIndexHtml(index));
  return { jsonPath, htmlPath };
}
