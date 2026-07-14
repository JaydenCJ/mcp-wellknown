import { WELL_KNOWN_PATH } from "./schema.js";
import type {
  CapabilityValue,
  McpWellKnownDocument,
  ServerEntry,
} from "./types.js";

const CAPABILITY_KEYS = [
  "tools",
  "resources",
  "prompts",
  "completions",
  "logging",
] as const;

export interface ServerSummary {
  name: string;
  description?: string;
  endpoint: string;
  transport: string;
  auth: string;
  /** Rendered capability descriptions, e.g. `tools (2): search, fetch`. */
  capabilities: string[];
  docs?: string;
}

export interface DocumentSummary {
  name: string;
  description?: string;
  version?: string;
  spec_version: string;
  contact?: string;
  updated_at?: string;
  servers: ServerSummary[];
}

/** Normalize a user-supplied domain into the well-known URL to fetch. */
export function wellKnownUrl(domain: string): string {
  let host = domain.trim().replace(/^https?:\/\//i, "");
  host = host.replace(/\/.*$/, "");
  if (host === "" || !/^[a-z0-9.-]+(?::\d+)?$/i.test(host)) {
    throw new Error(`invalid domain: "${domain}"`);
  }
  return `https://${host}${WELL_KNOWN_PATH}`;
}

function describeCapability(key: string, value: CapabilityValue): string | undefined {
  if (value === true) return key;
  if (value === false) return undefined;
  if (value.length === 0) return `${key} (0)`;
  return `${key} (${value.length}): ${value.join(", ")}`;
}

function summarizeServer(server: ServerEntry): ServerSummary {
  const capabilities: string[] = [];
  for (const key of CAPABILITY_KEYS) {
    const value = server.capabilities?.[key];
    if (value === undefined) continue;
    const described = describeCapability(key, value);
    if (described !== undefined) capabilities.push(described);
  }
  return {
    name: server.name,
    ...(server.description !== undefined ? { description: server.description } : {}),
    endpoint: server.endpoint,
    transport: server.transport,
    auth: server.authentication?.type ?? "none",
    capabilities,
    ...(server.docs !== undefined ? { docs: server.docs } : {}),
  };
}

/** Reduce a document to the capability summary shown by `inspect` and `crawl`. */
export function summarizeDocument(doc: McpWellKnownDocument): DocumentSummary {
  return {
    name: doc.name,
    ...(doc.description !== undefined ? { description: doc.description } : {}),
    ...(doc.version !== undefined ? { version: doc.version } : {}),
    spec_version: doc.spec_version,
    ...(doc.contact !== undefined ? { contact: doc.contact } : {}),
    ...(doc.updated_at !== undefined ? { updated_at: doc.updated_at } : {}),
    servers: doc.servers.map(summarizeServer),
  };
}

/** Render a summary as human-readable terminal text. */
export function formatSummary(summary: DocumentSummary): string {
  const lines: string[] = [];
  lines.push(summary.name + (summary.description ? ` — ${summary.description}` : ""));
  if (summary.version !== undefined) lines.push(`  version:      ${summary.version}`);
  lines.push(`  spec_version: ${summary.spec_version}`);
  if (summary.updated_at !== undefined) lines.push(`  updated_at:   ${summary.updated_at}`);
  if (summary.contact !== undefined) lines.push(`  contact:      ${summary.contact}`);
  lines.push("");
  lines.push(`Servers (${summary.servers.length}):`);
  summary.servers.forEach((server, i) => {
    lines.push(
      `  ${i + 1}. ${server.name}  ${server.endpoint}  [${server.transport}, auth: ${server.auth}]`,
    );
    if (server.description !== undefined) {
      lines.push(`     ${server.description}`);
    }
    if (server.capabilities.length > 0) {
      lines.push(`     capabilities: ${server.capabilities.join("; ")}`);
    }
    if (server.docs !== undefined) {
      lines.push(`     docs: ${server.docs}`);
    }
  });
  return lines.join("\n");
}
