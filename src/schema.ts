import { readFileSync } from "node:fs";

/** Canonical published location of the reference JSON Schema. */
export const SCHEMA_URL =
  "https://raw.githubusercontent.com/mcp-wellknown/mcp-wellknown/main/schemas/mcp-wellknown.schema.json";

/** Default MCP specification revision suggested by `init`. */
export const DEFAULT_SPEC_VERSION = "2025-06-18";

/** Well-known path at which the document is served. */
export const WELL_KNOWN_PATH = "/.well-known/mcp.json";

// The schema file ships alongside the package (see `files` in package.json).
// This module lives in either `src/` or `dist/`, both one level below the
// package root, so `../schemas/...` resolves in both layouts.
const schemaUrl = new URL("../schemas/mcp-wellknown.schema.json", import.meta.url);

/** The reference JSON Schema (draft 2020-12) as a plain object. */
export const schema: Record<string, unknown> = JSON.parse(
  readFileSync(schemaUrl, "utf8"),
) as Record<string, unknown>;
