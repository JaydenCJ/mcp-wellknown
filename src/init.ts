import { existsSync, writeFileSync } from "node:fs";

import { DEFAULT_SPEC_VERSION } from "./schema.js";
import type {
  AuthType,
  Capabilities,
  GeneratorConfig,
  Transport,
} from "./types.js";

const TRANSPORTS: readonly Transport[] = ["streamable-http", "sse"];
const AUTH_TYPES: readonly AuthType[] = ["none", "oauth2", "bearer"];
const CAPABILITY_KEYS = [
  "tools",
  "resources",
  "prompts",
  "completions",
  "logging",
] as const;

export interface InitFlags {
  name?: string;
  description?: string;
  contact?: string;
  docVersion?: string;
  specVersion?: string;
  serverName?: string;
  endpoint?: string;
  transport?: string;
  auth?: string;
  /** Comma-separated list, e.g. "tools,resources". */
  capabilities?: string;
  docs?: string;
  outDir?: string;
}

/** Parse `--capabilities tools,resources` into a Capabilities object. */
export function parseCapabilities(spec: string): Capabilities {
  const capabilities: Capabilities = {};
  for (const part of spec.split(",")) {
    const key = part.trim();
    if (key === "") continue;
    if (!(CAPABILITY_KEYS as readonly string[]).includes(key)) {
      throw new Error(
        `unknown capability "${key}" (expected one of: ${CAPABILITY_KEYS.join(", ")})`,
      );
    }
    capabilities[key as (typeof CAPABILITY_KEYS)[number]] = true;
  }
  return capabilities;
}

/** Build a generator config from `init` flags, applying documented defaults. */
export function buildConfig(flags: InitFlags = {}): GeneratorConfig {
  const transport = (flags.transport ?? "streamable-http") as Transport;
  if (!TRANSPORTS.includes(transport)) {
    throw new Error(
      `invalid transport "${flags.transport}" (expected one of: ${TRANSPORTS.join(", ")})`,
    );
  }
  const auth = (flags.auth ?? "none") as AuthType;
  if (!AUTH_TYPES.includes(auth)) {
    throw new Error(
      `invalid auth type "${flags.auth}" (expected one of: ${AUTH_TYPES.join(", ")})`,
    );
  }

  const capabilities = parseCapabilities(flags.capabilities ?? "tools");

  const config: GeneratorConfig = {
    outDir: flags.outDir ?? ".",
    document: {
      name: flags.name ?? "Example Organization",
      description:
        flags.description ?? "MCP servers published by this domain.",
      version: flags.docVersion ?? "0.1.0",
      spec_version: flags.specVersion ?? DEFAULT_SPEC_VERSION,
      servers: [
        {
          name: flags.serverName ?? "main",
          endpoint: flags.endpoint ?? "https://mcp.example.com/mcp",
          transport,
          authentication: { type: auth },
          ...(Object.keys(capabilities).length > 0 ? { capabilities } : {}),
          ...(flags.docs !== undefined ? { docs: flags.docs } : {}),
        },
      ],
      ...(flags.contact !== undefined ? { contact: flags.contact } : {}),
    },
  };
  return config;
}

/** Write the config file, refusing to overwrite unless `force` is set. */
export function writeConfigFile(
  filePath: string,
  config: GeneratorConfig,
  force = false,
): void {
  if (!force && existsSync(filePath)) {
    throw new Error(`${filePath} already exists (use --force to overwrite)`);
  }
  writeFileSync(filePath, `${JSON.stringify(config, null, 2)}\n`);
}
