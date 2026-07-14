/**
 * mcp-wellknown — reference implementation of MCP `.well-known` capability
 * discovery: JSON Schema, validator, static generator, and crawler.
 */

export {
  schema,
  SCHEMA_URL,
  DEFAULT_SPEC_VERSION,
  WELL_KNOWN_PATH,
} from "./schema.js";

export type {
  AuthType,
  Authentication,
  Capabilities,
  CapabilityValue,
  GeneratorConfig,
  McpWellKnownDocument,
  ServerEntry,
  Transport,
  ValidationIssue,
  ValidationResult,
} from "./types.js";

export { validateDocument, type ValidateOptions } from "./validate.js";
export { semanticIssues, type SemanticFindings } from "./semantic.js";

export {
  generateDocument,
  generateFromConfigFile,
  loadConfigFile,
  parseConfig,
  type GenerateFileResult,
  type GenerateOptions,
} from "./generate.js";

export {
  buildConfig,
  parseCapabilities,
  writeConfigFile,
  type InitFlags,
} from "./init.js";

export {
  formatSummary,
  summarizeDocument,
  wellKnownUrl,
  type DocumentSummary,
  type ServerSummary,
} from "./inspect.js";

export {
  crawlDomains,
  httpLoader,
  offlineLoader,
  parseDomainsFile,
  renderIndexHtml,
  writeIndex,
  type CrawlEntry,
  type CrawlIndex,
  type CrawlOptions,
  type DocumentLoader,
  type WriteIndexResult,
} from "./crawl.js";

export { fetchJson, type FetchJsonOptions } from "./fetch.js";
