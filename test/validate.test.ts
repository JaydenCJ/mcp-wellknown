import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { validateDocument } from "../src/validate.js";
import type { McpWellKnownDocument } from "../src/types.js";

const fixturesDir = fileURLToPath(new URL("./fixtures", import.meta.url));

// A reference "now" so fixtures with fixed timestamps never drift into
// "updated_at is in the future" warnings as wall-clock time passes.
const NOW = new Date("2026-07-01T00:00:00Z");

function loadFixture(kind: "valid" | "invalid", file: string): unknown {
  return JSON.parse(readFileSync(path.join(fixturesDir, kind, file), "utf8"));
}

function baseDoc(): McpWellKnownDocument {
  return JSON.parse(
    readFileSync(path.join(fixturesDir, "valid", "minimal.json"), "utf8"),
  ) as McpWellKnownDocument;
}

describe("fixtures", () => {
  const validFiles = readdirSync(path.join(fixturesDir, "valid"));
  const invalidFiles = readdirSync(path.join(fixturesDir, "invalid"));

  it("has multiple fixtures on both sides", () => {
    expect(validFiles.length).toBeGreaterThanOrEqual(3);
    expect(invalidFiles.length).toBeGreaterThanOrEqual(10);
  });

  it.each(validFiles)("accepts valid/%s", (file) => {
    const result = validateDocument(loadFixture("valid", file), { now: NOW });
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.schemaValid).toBe(true);
  });

  it.each(invalidFiles)("rejects invalid/%s", (file) => {
    const result = validateDocument(loadFixture("invalid", file), { now: NOW });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it.each(invalidFiles)("invalid/%s errors carry JSON paths", (file) => {
    const result = validateDocument(loadFixture("invalid", file), { now: NOW });
    for (const issue of result.errors) {
      expect(issue.path).toMatch(/^\//);
      expect(issue.code).toMatch(/^(schema|semantic)\//);
      expect(issue.message.length).toBeGreaterThan(0);
    }
  });
});

describe("schema errors", () => {
  it("rejects non-object documents", () => {
    expect(validateDocument([]).valid).toBe(false);
    expect(validateDocument(null).valid).toBe(false);
    expect(validateDocument("mcp").valid).toBe(false);
  });

  it("reports missing required properties with a suggestion", () => {
    const result = validateDocument({ name: "X" });
    const missing = result.errors.filter((e) => e.code === "schema/required");
    expect(missing.map((e) => e.message).join(" ")).toContain("spec_version");
    expect(missing.map((e) => e.message).join(" ")).toContain("servers");
    expect(missing.every((e) => e.suggestion !== undefined)).toBe(true);
  });

  it("reports unknown properties with the property name", () => {
    const result = validateDocument(loadFixture("invalid", "unknown-field.json"), {
      now: NOW,
    });
    const unknown = result.errors.find((e) => e.code === "schema/additionalProperties");
    expect(unknown).toBeDefined();
    expect(unknown?.message).toContain("serverz");
  });

  it("suggests allowed enum values for transport", () => {
    const result = validateDocument(loadFixture("invalid", "bad-transport.json"), {
      now: NOW,
    });
    const issue = result.errors.find((e) => e.path === "/servers/0/transport");
    expect(issue).toBeDefined();
    expect(issue?.suggestion).toContain("streamable-http");
    expect(issue?.suggestion).toContain("sse");
  });
});

describe("semantic checks", () => {
  it("requires https endpoints", () => {
    const result = validateDocument(loadFixture("invalid", "http-endpoint.json"), {
      now: NOW,
    });
    expect(result.schemaValid).toBe(true);
    const issue = result.errors.find((e) => e.code === "semantic/endpoint-https");
    expect(issue?.path).toBe("/servers/0/endpoint");
    expect(issue?.suggestion).toMatch(/TLS/);
  });

  it("rejects invalid endpoint URLs", () => {
    const doc = baseDoc();
    doc.servers[0]!.endpoint = "not a url";
    const result = validateDocument(doc, { now: NOW });
    expect(
      result.errors.some(
        (e) =>
          e.path === "/servers/0/endpoint" &&
          (e.code === "semantic/endpoint-url" || e.code === "schema/format"),
      ),
    ).toBe(true);
  });

  it("requires semver for version", () => {
    const result = validateDocument(loadFixture("invalid", "bad-version.json"), {
      now: NOW,
    });
    const issue = result.errors.find((e) => e.code === "semantic/version-semver");
    expect(issue?.path).toBe("/version");
    expect(issue?.suggestion).toContain("MAJOR.MINOR.PATCH");
  });

  it("accepts prerelease and build-metadata semver", () => {
    const doc = baseDoc();
    doc.version = "2.0.0-rc.1+build.5";
    expect(validateDocument(doc, { now: NOW }).valid).toBe(true);
  });

  it("requires date-based spec_version", () => {
    const result = validateDocument(loadFixture("invalid", "bad-spec-version.json"), {
      now: NOW,
    });
    const issue = result.errors.find((e) => e.code === "semantic/spec-version-format");
    expect(issue?.path).toBe("/spec_version");
  });

  it("rejects impossible spec_version calendar dates", () => {
    const doc = baseDoc();
    doc.spec_version = "2025-02-30";
    const result = validateDocument(doc, { now: NOW });
    expect(result.errors.some((e) => e.code === "semantic/spec-version-date")).toBe(true);
  });

  it("requires ISO 8601 updated_at", () => {
    const result = validateDocument(loadFixture("invalid", "bad-updated-at.json"), {
      now: NOW,
    });
    const issue = result.errors.find((e) => e.code === "semantic/updated-at-iso8601");
    expect(issue?.path).toBe("/updated_at");
  });

  it("rejects date-only updated_at values", () => {
    const doc = baseDoc();
    doc.updated_at = "2026-06-01";
    const result = validateDocument(doc, { now: NOW });
    expect(result.errors.some((e) => e.code === "semantic/updated-at-iso8601")).toBe(true);
  });

  it("warns when updated_at is missing", () => {
    const doc = baseDoc();
    delete doc.updated_at;
    const result = validateDocument(doc, { now: NOW });
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.code === "semantic/updated-at-missing")).toBe(true);
  });

  it("warns when updated_at is in the future", () => {
    const doc = baseDoc();
    doc.updated_at = "2030-01-01T00:00:00Z";
    const result = validateDocument(doc, { now: NOW });
    expect(result.valid).toBe(true);
    const warning = result.warnings.find((w) => w.code === "semantic/updated-at-future");
    expect(warning?.path).toBe("/updated_at");
  });

  it("requires unique server names and points at the duplicate", () => {
    const result = validateDocument(
      loadFixture("invalid", "duplicate-server-names.json"),
      { now: NOW },
    );
    const issue = result.errors.find((e) => e.code === "semantic/server-name-unique");
    expect(issue?.path).toBe("/servers/1/name");
    expect(issue?.message).toContain("/servers/0/name");
  });

  it("warns on oauth2 without authorization_server", () => {
    const doc = baseDoc();
    doc.servers[0]!.authentication = { type: "oauth2", scopes: ["read"] };
    const result = validateDocument(doc, { now: NOW });
    expect(result.valid).toBe(true);
    expect(
      result.warnings.some((w) => w.code === "semantic/oauth2-authorization-server"),
    ).toBe(true);
  });

  it("warns on non-https docs links", () => {
    const doc = baseDoc();
    doc.servers[0]!.docs = "http://docs.example.com";
    const result = validateDocument(doc, { now: NOW });
    expect(result.warnings.some((w) => w.code === "semantic/docs-https")).toBe(true);
  });

  it("warns on contact values that are neither mailto: nor https://", () => {
    const doc = baseDoc();
    doc.contact = "call me maybe";
    const result = validateDocument(doc, { now: NOW });
    expect(result.warnings.some((w) => w.code === "semantic/contact-scheme")).toBe(true);
  });
});
