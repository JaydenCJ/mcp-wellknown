/**
 * Isomorphic TypeScript types for the `.well-known/mcp.json` discovery
 * document. These mirror `schemas/mcp-wellknown.schema.json` — keep both in
 * sync when the format evolves.
 */

/** Transport protocols an MCP server can advertise. */
export type Transport = "streamable-http" | "sse";

/** Authentication schemes an MCP server can advertise. */
export type AuthType = "none" | "oauth2" | "bearer";

/**
 * A capability is either a boolean ("we support tools") or a list of feature
 * names ("these are the tools we expose").
 */
export type CapabilityValue = boolean | string[];

export interface Authentication {
  type: AuthType;
  /** OAuth 2.0 scopes clients should request. */
  scopes?: string[];
  /** OAuth 2.0 authorization server issuer URL (for `type: oauth2`). */
  authorization_server?: string;
}

/**
 * Server-side MCP capabilities. Client-side capabilities (e.g. sampling,
 * which servers *request from* clients) are deliberately not part of this
 * document — it describes what a server offers.
 */
export interface Capabilities {
  tools?: CapabilityValue;
  resources?: CapabilityValue;
  prompts?: CapabilityValue;
  completions?: CapabilityValue;
  logging?: CapabilityValue;
}

/** One MCP server exposed by the publishing domain. */
export interface ServerEntry {
  /** Identifier, unique within the document. */
  name: string;
  description?: string;
  /** HTTPS URL of the MCP endpoint. */
  endpoint: string;
  transport: Transport;
  authentication?: Authentication;
  capabilities?: Capabilities;
  /** Human-readable documentation URL. */
  docs?: string;
}

/** The full `.well-known/mcp.json` document. */
export interface McpWellKnownDocument {
  $schema?: string;
  /** Publisher name (organization or product). */
  name: string;
  description?: string;
  /** Version of this discovery document (semver). */
  version?: string;
  /** MCP specification revision the servers target (e.g. "2025-06-18"). */
  spec_version: string;
  servers: ServerEntry[];
  /** `mailto:` URI or `https://` URL. */
  contact?: string;
  /** ISO 8601 timestamp of the last update. */
  updated_at?: string;
}

/** Shape of `mcp-wellknown.config.json`, consumed by `mcp-wellknown generate`. */
export interface GeneratorConfig {
  $schema?: string;
  /** Directory in which `.well-known/mcp.json` is written. Defaults to ".". */
  outDir?: string;
  /** The document to publish. `updated_at` is stamped at generate time if absent. */
  document: McpWellKnownDocument;
}

/** A single validation finding, pointing into the document via JSON Pointer. */
export interface ValidationIssue {
  /** JSON Pointer to the offending value, e.g. "/servers/0/endpoint". */
  path: string;
  /** Stable machine-readable code, e.g. "schema/required" or "semantic/endpoint-https". */
  code: string;
  /** Human-readable description of the problem. */
  message: string;
  /** Actionable fix suggestion. */
  suggestion?: string;
}

export interface ValidationResult {
  /** True when there are no errors (warnings are allowed). */
  valid: boolean;
  /** True when the document matches the JSON Schema (semantic errors may still exist). */
  schemaValid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}
