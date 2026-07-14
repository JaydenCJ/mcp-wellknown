import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { formatSummary, summarizeDocument, wellKnownUrl } from "../src/inspect.js";
import type { McpWellKnownDocument } from "../src/types.js";

const fixturesDir = fileURLToPath(new URL("./fixtures", import.meta.url));

function loadValid(file: string): McpWellKnownDocument {
  return JSON.parse(
    readFileSync(path.join(fixturesDir, "valid", file), "utf8"),
  ) as McpWellKnownDocument;
}

describe("wellKnownUrl", () => {
  it("builds the well-known URL from a bare domain", () => {
    expect(wellKnownUrl("example.com")).toBe("https://example.com/.well-known/mcp.json");
  });

  it("normalizes scheme, path, and whitespace", () => {
    expect(wellKnownUrl(" https://example.com/some/path ")).toBe(
      "https://example.com/.well-known/mcp.json",
    );
    expect(wellKnownUrl("mcp.example.com:8443")).toBe(
      "https://mcp.example.com:8443/.well-known/mcp.json",
    );
  });

  it("rejects garbage", () => {
    expect(() => wellKnownUrl("")).toThrow(/invalid domain/);
    expect(() => wellKnownUrl("exa mple.com")).toThrow(/invalid domain/);
  });
});

describe("summarizeDocument", () => {
  it("summarizes servers, auth, and capabilities", () => {
    const summary = summarizeDocument(loadValid("full.json"));
    expect(summary.name).toBe("Acme Developer Platform");
    expect(summary.spec_version).toBe("2025-06-18");
    expect(summary.servers).toHaveLength(2);

    const docs = summary.servers[0]!;
    expect(docs.auth).toBe("none");
    expect(docs.capabilities).toContain("tools (2): search_docs, fetch_page");
    expect(docs.capabilities).toContain("resources");

    const issues = summary.servers[1]!;
    expect(issues.auth).toBe("oauth2");
    expect(issues.transport).toBe("sse");
    // logging: false must not be advertised as a capability
    expect(issues.capabilities.join(" ")).not.toContain("logging");
  });

  it("defaults auth to none when authentication is omitted", () => {
    const summary = summarizeDocument(loadValid("minimal.json"));
    expect(summary.servers[0]!.auth).toBe("none");
    expect(summary.servers[0]!.capabilities).toEqual([]);
  });
});

describe("formatSummary", () => {
  it("renders a readable report", () => {
    const text = formatSummary(summarizeDocument(loadValid("full.json")));
    expect(text).toContain("Acme Developer Platform");
    expect(text).toContain("Servers (2):");
    expect(text).toContain("https://mcp.acme.example/docs");
    expect(text).toContain("[sse, auth: oauth2]");
    expect(text).toContain("capabilities: tools (2): search_docs, fetch_page");
  });
});
