import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { generateDocument, generateFromConfigFile, parseConfig } from "../src/generate.js";
import { buildConfig, parseCapabilities, writeConfigFile } from "../src/init.js";
import { SCHEMA_URL } from "../src/schema.js";
import { validateDocument } from "../src/validate.js";

const fixturesDir = fileURLToPath(new URL("./fixtures", import.meta.url));
const NOW = new Date("2026-07-01T00:00:00Z");

const tempDirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "mcp-wellknown-test-"));
  tempDirs.push(dir);
  return dir;
}
afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe("buildConfig", () => {
  it("produces a config whose generated document validates", () => {
    const config = buildConfig({
      name: "Acme",
      endpoint: "https://mcp.acme.dev/mcp",
      contact: "mailto:mcp@acme.dev",
      capabilities: "tools,resources",
    });
    const doc = generateDocument(config, { now: NOW });
    const result = validateDocument(doc, { now: NOW });
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
    expect(doc.name).toBe("Acme");
    expect(doc.servers[0]?.capabilities).toEqual({ tools: true, resources: true });
  });

  it("rejects unknown transports, auth types, and capabilities", () => {
    expect(() => buildConfig({ transport: "websocket" })).toThrow(/transport/);
    expect(() => buildConfig({ auth: "apikey" })).toThrow(/auth/);
    expect(() => parseCapabilities("tools,telepathy")).toThrow(/telepathy/);
  });
});

describe("generateDocument", () => {
  it("stamps updated_at with the provided clock and links the schema", () => {
    const config = buildConfig({});
    const doc = generateDocument(config, { now: NOW });
    expect(doc.updated_at).toBe("2026-07-01T00:00:00Z");
    expect(doc.$schema).toBe(SCHEMA_URL);
  });

  it("respects a pinned updated_at and does not mutate the config", () => {
    const config = buildConfig({});
    config.document.updated_at = "2026-01-01T00:00:00Z";
    const doc = generateDocument(config, { now: NOW });
    expect(doc.updated_at).toBe("2026-01-01T00:00:00Z");
    expect(config.document.$schema).toBeUndefined();
  });
});

describe("parseConfig", () => {
  it("rejects configs without a document object", () => {
    expect(() => parseConfig({ outDir: "." })).toThrow(/document/);
    expect(() => parseConfig("nope")).toThrow(/object/);
    expect(() => parseConfig({ document: {}, outDir: 3 })).toThrow(/outDir/);
  });
});

describe("generate -> validate round-trip", () => {
  it("init config, generate to disk, re-read, and validate", () => {
    const dir = tempDir();
    const configPath = path.join(dir, "mcp-wellknown.config.json");
    const config = buildConfig({
      name: "Round Trip Org",
      endpoint: "https://mcp.roundtrip.example/mcp",
      auth: "bearer",
      capabilities: "tools,prompts",
    });
    writeConfigFile(configPath, config);

    const { result, outPath } = generateFromConfigFile(configPath, {
      outDir: dir,
      now: NOW,
    });
    expect(result.valid).toBe(true);
    expect(outPath).toBe(path.join(dir, ".well-known", "mcp.json"));

    const written = JSON.parse(readFileSync(outPath!, "utf8"));
    const reread = validateDocument(written, { now: NOW });
    expect(reread.valid).toBe(true);
    expect(reread.errors).toEqual([]);
  });

  it("works against the checked-in config fixture", () => {
    const dir = tempDir();
    const { result, outPath, document } = generateFromConfigFile(
      path.join(fixturesDir, "mcp-wellknown.config.json"),
      { outDir: dir, now: NOW },
    );
    expect(result.valid).toBe(true);
    expect(document.name).toBe("Fixture Org");
    expect(readFileSync(outPath!, "utf8")).toContain("mcp.fixture.example");
  });

  it("refuses to write invalid documents", () => {
    const dir = tempDir();
    const configPath = path.join(dir, "bad.config.json");
    const config = buildConfig({});
    config.document.servers[0]!.endpoint = "http://insecure.example.com/mcp";
    writeConfigFile(configPath, config);

    const { result, outPath } = generateFromConfigFile(configPath, {
      outDir: dir,
      now: NOW,
    });
    expect(result.valid).toBe(false);
    expect(outPath).toBeUndefined();
  });

  it("writeConfigFile refuses to overwrite without force", () => {
    const dir = tempDir();
    const configPath = path.join(dir, "config.json");
    writeConfigFile(configPath, buildConfig({}));
    expect(() => writeConfigFile(configPath, buildConfig({}))).toThrow(/--force/);
    expect(() => writeConfigFile(configPath, buildConfig({}), true)).not.toThrow();
  });
});
