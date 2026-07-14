import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { promisify } from "node:util";
import { afterAll, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

// `npm test` builds first (pretest), so the compiled CLI is available.
const cliPath = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const fixturesDir = fileURLToPath(new URL("./fixtures", import.meta.url));

interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

async function runCli(args: string[], cwd?: string): Promise<CliResult> {
  try {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [cliPath, ...args],
      { cwd },
    );
    return { code: 0, stdout, stderr };
  } catch (err) {
    const e = err as { code?: number; stdout?: string; stderr?: string };
    return { code: e.code ?? 1, stdout: e.stdout ?? "", stderr: e.stderr ?? "" };
  }
}

const tempDirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "mcp-wellknown-cli-"));
  tempDirs.push(dir);
  return dir;
}
afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

describe("mcp-wellknown CLI", () => {
  it("prints help listing all subcommands", async () => {
    const { code, stdout } = await runCli(["--help"]);
    expect(code).toBe(0);
    for (const cmd of ["init", "generate", "validate", "inspect", "crawl"]) {
      expect(stdout).toContain(cmd);
    }
  });

  it("validate exits 0 on a valid file", async () => {
    const { code, stdout } = await runCli([
      "validate",
      path.join(fixturesDir, "valid", "full.json"),
    ]);
    expect(code).toBe(0);
    expect(stdout).toContain("OK");
  });

  it("validate exits 1 on an invalid file and shows path + fix", async () => {
    const { code, stdout } = await runCli([
      "validate",
      path.join(fixturesDir, "invalid", "http-endpoint.json"),
    ]);
    expect(code).toBe(1);
    expect(stdout).toContain("/servers/0/endpoint");
    expect(stdout).toContain("fix:");
  });

  it("validate --json emits machine-readable output", async () => {
    const { code, stdout } = await runCli([
      "validate",
      "--json",
      path.join(fixturesDir, "invalid", "duplicate-server-names.json"),
    ]);
    expect(code).toBe(1);
    const parsed = JSON.parse(stdout);
    expect(parsed.valid).toBe(false);
    expect(parsed.errors[0].path).toBe("/servers/1/name");
  });

  it("init -> generate -> validate round-trips through the CLI", async () => {
    const dir = tempDir();
    const init = await runCli(
      [
        "init",
        "--name",
        "CLI Test Org",
        "--endpoint",
        "https://mcp.cli.example/mcp",
        "--capabilities",
        "tools,resources",
        "--contact",
        "mailto:mcp@cli.example",
      ],
      dir,
    );
    expect(init.code).toBe(0);
    expect(existsSync(path.join(dir, "mcp-wellknown.config.json"))).toBe(true);

    const generate = await runCli(["generate"], dir);
    expect(generate.code).toBe(0);
    const outFile = path.join(dir, ".well-known", "mcp.json");
    expect(existsSync(outFile)).toBe(true);

    const doc = JSON.parse(readFileSync(outFile, "utf8"));
    expect(doc.name).toBe("CLI Test Org");
    expect(typeof doc.updated_at).toBe("string");

    const validate = await runCli(["validate", outFile], dir);
    expect(validate.code).toBe(0);
  });

  it("inspect --file prints a capability summary offline", async () => {
    const { code, stdout } = await runCli([
      "inspect",
      "--file",
      path.join(fixturesDir, "valid", "full.json"),
    ]);
    expect(code).toBe(0);
    expect(stdout).toContain("Acme Developer Platform");
    expect(stdout).toContain("Servers (2):");
    expect(stdout).toContain("auth: oauth2");
  });

  it("crawl --offline builds index.json and index.html", async () => {
    const outDir = path.join(tempDir(), "site");
    const { code, stdout } = await runCli([
      "crawl",
      path.join(fixturesDir, "offline", "domains.txt"),
      "--offline",
      path.join(fixturesDir, "offline"),
      "--out",
      outDir,
    ]);
    expect(code).toBe(0);
    expect(stdout).toContain("Crawled 4 domain(s): 3 reachable, 2 valid.");

    const index = JSON.parse(readFileSync(path.join(outDir, "index.json"), "utf8"));
    expect(index.total).toBe(4);
    const html = readFileSync(path.join(outDir, "index.html"), "utf8");
    expect(html).toContain("mcp.acme.example");
  });

  it("generate fails cleanly on a missing config", async () => {
    const { code, stderr } = await runCli(["generate", "does-not-exist.json"]);
    expect(code).toBe(1);
    expect(stderr).toContain("cannot read config");
  });
});
