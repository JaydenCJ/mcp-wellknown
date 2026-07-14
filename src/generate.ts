import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { SCHEMA_URL } from "./schema.js";
import { validateDocument } from "./validate.js";
import type {
  GeneratorConfig,
  McpWellKnownDocument,
  ValidationResult,
} from "./types.js";

export interface GenerateOptions {
  /** Timestamp used for `updated_at` when the config does not pin one. */
  now?: Date;
}

/**
 * Produce the publishable document from a generator config: stamps
 * `updated_at` (unless pinned in the config) and links the reference schema
 * via `$schema` (unless already set).
 */
export function generateDocument(
  config: GeneratorConfig,
  options: GenerateOptions = {},
): McpWellKnownDocument {
  const doc = structuredClone(config.document);
  if (doc.$schema === undefined) {
    doc.$schema = SCHEMA_URL;
  }
  if (doc.updated_at === undefined) {
    const now = options.now ?? new Date();
    doc.updated_at = now.toISOString().replace(/\.\d{3}Z$/, "Z");
  }
  return doc;
}

/** Parse and shape-check a generator config loaded from JSON. */
export function parseConfig(raw: unknown): GeneratorConfig {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("config must be a JSON object");
  }
  const config = raw as Record<string, unknown>;
  if (
    typeof config.document !== "object" ||
    config.document === null ||
    Array.isArray(config.document)
  ) {
    throw new Error('config must have a "document" object (the mcp.json contents to publish)');
  }
  if (config.outDir !== undefined && typeof config.outDir !== "string") {
    throw new Error('config "outDir" must be a string when present');
  }
  return raw as GeneratorConfig;
}

export function loadConfigFile(configPath: string): GeneratorConfig {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(configPath, "utf8"));
  } catch (err) {
    throw new Error(
      `cannot read config ${configPath}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  return parseConfig(raw);
}

export interface GenerateFileResult {
  document: McpWellKnownDocument;
  result: ValidationResult;
  /** Absolute or cwd-relative path of the written file; unset when validation failed. */
  outPath?: string;
}

/**
 * Full `generate` pipeline: load config, build the document, validate it,
 * and — only if valid — write `<outDir>/.well-known/mcp.json`.
 */
export function generateFromConfigFile(
  configPath: string,
  options: GenerateOptions & { outDir?: string } = {},
): GenerateFileResult {
  const config = loadConfigFile(configPath);
  const document = generateDocument(config, options);
  const result = validateDocument(document, { now: options.now });
  if (!result.valid) {
    return { document, result };
  }
  const outDir = options.outDir ?? config.outDir ?? ".";
  const wellKnownDir = path.join(outDir, ".well-known");
  mkdirSync(wellKnownDir, { recursive: true });
  const outPath = path.join(wellKnownDir, "mcp.json");
  writeFileSync(outPath, `${JSON.stringify(document, null, 2)}\n`);
  return { document, result, outPath };
}
