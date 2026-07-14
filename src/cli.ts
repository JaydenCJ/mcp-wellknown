#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { Command } from "commander";

import {
  crawlDomains,
  httpLoader,
  offlineLoader,
  parseDomainsFile,
  writeIndex,
} from "./crawl.js";
import { fetchJson } from "./fetch.js";
import { generateFromConfigFile } from "./generate.js";
import { buildConfig, writeConfigFile } from "./init.js";
import { formatSummary, summarizeDocument, wellKnownUrl } from "./inspect.js";
import { validateDocument } from "./validate.js";
import type {
  McpWellKnownDocument,
  ValidationIssue,
  ValidationResult,
} from "./types.js";

const pkg = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { version: string };

function printIssues(issues: ValidationIssue[], label: string): void {
  for (const issue of issues) {
    console.log(`  ${label}  ${issue.path}`);
    console.log(`         ${issue.message}`);
    if (issue.suggestion) {
      console.log(`         fix: ${issue.suggestion}`);
    }
  }
}

function printResult(result: ValidationResult): void {
  if (result.valid && result.warnings.length === 0) {
    console.log("OK: document is valid");
    return;
  }
  if (result.valid) {
    console.log(`OK: document is valid (${result.warnings.length} warning(s))`);
  } else {
    console.log(
      `INVALID: ${result.errors.length} error(s), ${result.warnings.length} warning(s)`,
    );
  }
  printIssues(result.errors, "error");
  printIssues(result.warnings, "warn ");
}

function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}

async function loadTarget(target: string): Promise<unknown> {
  if (/^https?:\/\//i.test(target)) {
    return fetchJson(target);
  }
  let raw: string;
  try {
    raw = readFileSync(target, "utf8");
  } catch (err) {
    fail(`cannot read ${target}: ${err instanceof Error ? err.message : String(err)}`);
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    fail(`${target} is not valid JSON`);
  }
}

const program = new Command();

program
  .name("mcp-wellknown")
  .description(
    "Reference tooling for MCP .well-known capability discovery: generate, validate, inspect, and index /.well-known/mcp.json documents.",
  )
  .version(pkg.version);

program
  .command("init")
  .description("create an mcp-wellknown.config.json from flags")
  .option("--name <name>", "publisher name", "Example Organization")
  .option("--description <text>", "publisher description")
  .option("--contact <uri>", "contact (mailto: or https://)")
  .option("--doc-version <semver>", "discovery document version", "0.1.0")
  .option("--spec-version <date>", "MCP spec revision (YYYY-MM-DD)")
  .option("--server-name <name>", "server name", "main")
  .option("--endpoint <url>", "MCP endpoint URL", "https://mcp.example.com/mcp")
  .option("--transport <transport>", "streamable-http | sse", "streamable-http")
  .option("--auth <type>", "none | oauth2 | bearer", "none")
  .option(
    "--capabilities <list>",
    "comma-separated: tools,resources,prompts,completions,logging",
    "tools",
  )
  .option("--docs <url>", "documentation URL for the server")
  .option("--out <file>", "config file to write", "mcp-wellknown.config.json")
  .option("--force", "overwrite an existing config file", false)
  .action((opts: Record<string, string | boolean>) => {
    try {
      const config = buildConfig({
        name: opts.name as string,
        description: opts.description as string | undefined,
        contact: opts.contact as string | undefined,
        docVersion: opts.docVersion as string,
        specVersion: opts.specVersion as string | undefined,
        serverName: opts.serverName as string,
        endpoint: opts.endpoint as string,
        transport: opts.transport as string,
        auth: opts.auth as string,
        capabilities: opts.capabilities as string,
        docs: opts.docs as string | undefined,
      });
      writeConfigFile(opts.out as string, config, opts.force as boolean);
      console.log(`Wrote ${opts.out as string}`);
      console.log('Next: review it, then run "mcp-wellknown generate".');
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err));
    }
  });

program
  .command("generate")
  .description("generate .well-known/mcp.json from a config file")
  .argument("[config]", "path to config file", "mcp-wellknown.config.json")
  .option("--out-dir <dir>", "override the output directory from the config")
  .action((configPath: string, opts: { outDir?: string }) => {
    try {
      const { result, outPath } = generateFromConfigFile(configPath, {
        outDir: opts.outDir,
      });
      if (!result.valid || !outPath) {
        console.log("Refusing to write an invalid document:");
        printResult(result);
        process.exitCode = 1;
        return;
      }
      console.log(`Wrote ${outPath}`);
      if (result.warnings.length > 0) {
        printIssues(result.warnings, "warn ");
      }
      console.log(
        "Serve this file at https://<your-domain>/.well-known/mcp.json with content type application/json.",
      );
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err));
    }
  });

program
  .command("validate")
  .description("validate a discovery document from a file or URL")
  .argument("<file-or-url>", "path to a JSON file, or an https:// URL")
  .option("--json", "print the machine-readable result as JSON", false)
  .action(async (target: string, opts: { json: boolean }) => {
    const data = await loadTarget(target).catch((err: unknown) =>
      fail(err instanceof Error ? err.message : String(err)),
    );
    const result = validateDocument(data);
    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printResult(result);
    }
    process.exitCode = result.valid ? 0 : 1;
  });

program
  .command("inspect")
  .description("fetch a domain's /.well-known/mcp.json and print a capability summary")
  .argument("[domain]", "domain to inspect, e.g. example.com")
  .option("--file <path>", "read a local file instead of fetching the domain")
  .option("--json", "print the summary as JSON", false)
  .action(async (domain: string | undefined, opts: { file?: string; json: boolean }) => {
    let data: unknown;
    let source: string;
    if (opts.file !== undefined) {
      source = opts.file;
      data = await loadTarget(opts.file);
    } else if (domain !== undefined) {
      try {
        source = wellKnownUrl(domain);
      } catch (err) {
        fail(err instanceof Error ? err.message : String(err));
      }
      data = await fetchJson(source).catch((err: unknown) =>
        fail(err instanceof Error ? err.message : String(err)),
      );
    } else {
      fail("provide a domain, or --file <path> for offline inspection");
    }

    const result = validateDocument(data);
    if (!result.schemaValid) {
      console.log(`${source} does not match the mcp.json schema:`);
      printResult(result);
      process.exitCode = 1;
      return;
    }
    const summary = summarizeDocument(data as McpWellKnownDocument);
    if (opts.json) {
      console.log(JSON.stringify(summary, null, 2));
    } else {
      console.log(formatSummary(summary));
      console.log("");
      console.log(
        `validation: ${result.errors.length} error(s), ${result.warnings.length} warning(s)`,
      );
    }
    process.exitCode = result.valid ? 0 : 1;
  });

program
  .command("crawl")
  .description("crawl a list of domains and build an index (JSON + static HTML)")
  .argument("<domains-file>", "text file with one domain per line (# comments allowed)")
  .option(
    "--offline <dir>",
    "read <dir>/<domain>.json instead of fetching over the network",
  )
  .option("--out <dir>", "output directory for index.json and index.html", "mcp-index")
  .option("--timeout <ms>", "per-domain fetch timeout in milliseconds", "10000")
  .action(
    async (
      domainsFile: string,
      opts: { offline?: string; out: string; timeout: string },
    ) => {
      let domains: string[];
      try {
        domains = parseDomainsFile(readFileSync(domainsFile, "utf8"));
      } catch (err) {
        fail(`cannot read ${domainsFile}: ${err instanceof Error ? err.message : String(err)}`);
      }
      if (domains.length === 0) {
        fail(`${domainsFile} contains no domains`);
      }
      const loader = opts.offline
        ? offlineLoader(opts.offline)
        : httpLoader({ timeoutMs: Number(opts.timeout) || 10_000 });

      const index = await crawlDomains(domains, loader);
      for (const entry of index.entries) {
        if (!entry.ok) {
          console.log(`FAIL  ${entry.domain}: ${entry.error ?? "unknown error"}`);
        } else if (entry.valid) {
          console.log(
            `ok    ${entry.domain} (${entry.summary?.servers.length ?? 0} server(s))`,
          );
        } else {
          console.log(`bad   ${entry.domain}: ${entry.errors ?? 0} validation error(s)`);
        }
      }
      const { jsonPath, htmlPath } = writeIndex(index, opts.out);
      console.log("");
      console.log(
        `Crawled ${index.total} domain(s): ${index.reachable} reachable, ${index.valid} valid.`,
      );
      console.log(`Wrote ${jsonPath} and ${htmlPath}`);
    },
  );

program.parseAsync(process.argv).catch((err: unknown) => {
  fail(err instanceof Error ? err.message : String(err));
});
