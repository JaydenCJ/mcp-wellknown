# Contributing to mcp-wellknown

Thanks for your interest! This project is a reference implementation for MCP
`.well-known` capability discovery, so contributions fall into two buckets:
**format feedback** (what should the document look like?) and **tooling**
(validator, generator, crawler). Both are welcome.

## Development setup

Requirements: Node.js >= 20 (see `engines` in `package.json`).

```bash
git clone https://github.com/JaydenCJ/mcp-wellknown.git
cd mcp-wellknown
npm ci          # or: npm install
npm test        # builds first (pretest), then runs vitest
```

Useful commands:

| Command | What it does |
| --- | --- |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm test` | Build + run the full test suite (offline; no network needed) |
| `npm run typecheck` | Type-check without emitting |
| `node dist/cli.js --help` | Run the freshly built CLI |

Try the CLI against the bundled examples without touching the network:

```bash
node dist/cli.js validate examples/mcp.json
node dist/cli.js inspect --file examples/mcp.json
node dist/cli.js crawl examples/domains.txt --offline examples/offline --out /tmp/mcp-index
```

## Project layout

```
schemas/mcp-wellknown.schema.json   canonical JSON Schema (draft 2020-12)
src/types.ts                        isomorphic TS types (keep in sync with the schema)
src/validate.ts                     Ajv structural validation + error mapping
src/semantic.ts                     semantic rules (https, uniqueness, semver, ...)
src/generate.ts, src/init.ts        config scaffolding and static generation
src/inspect.ts                      capability summaries
src/crawl.ts                        crawler, index JSON, static index.html
src/cli.ts                          commander wiring only — logic lives in modules
test/                               vitest suites + fixtures (valid/, invalid/, offline/)
```

## Adding a semantic validation rule

1. Implement the check in `src/semantic.ts`. Emit a `ValidationIssue` with:
   - `path`: a JSON Pointer to the offending value (e.g. `/servers/0/endpoint`),
   - `code`: a stable `semantic/<kebab-case>` identifier,
   - `message`: what is wrong, including the offending value,
   - `suggestion`: how to fix it. Errors block; warnings advise — pick deliberately.
2. Add a fixture under `test/fixtures/invalid/` if the rule produces errors,
   and a targeted test in `test/validate.test.ts` (there is one per existing rule).
3. Document the rule in the "Validation rules" table in all three READMEs.

## Changing the document format

The JSON Schema is the source of truth; `src/types.ts` mirrors it by hand.
When you touch the format:

1. Update `schemas/mcp-wellknown.schema.json` **and** `src/types.ts` together.
2. Update fixtures, `examples/`, the field table in the READMEs, and `CHANGELOG.md`.
3. If the upstream MCP specification has landed an official shape for a field,
   prefer the official shape — this project tracks the spec, not the other way
   around. Link the relevant spec discussion/PR in your PR description.

Until 1.0, breaking schema changes are allowed in minor releases (documented
in the changelog).

## Adding a crawl loader or output backend

Loaders implement `DocumentLoader` (`(domain) => Promise<unknown>`) in
`src/crawl.ts` — see `httpLoader` and `offlineLoader`. New output formats
(e.g. RSS, sitemap) should be pure functions from `CrawlIndex` like
`renderIndexHtml`, plus a flag in the `crawl` subcommand and tests that run
offline.

## Pull request guidelines

- Use [Conventional Commits](https://www.conventionalcommits.org/) for commit
  messages and PR titles: `feat:`, `fix:`, `docs:`, `test:`, `chore:`
  (e.g. `feat: warn on wildcard scopes`).
- Keep PRs focused; schema changes and tooling changes are easier to review
  separately.
- All tests must pass (`npm test`) and must not require network access.
- Update the three READMEs together when user-facing behavior changes —
  they are translations of each other.

## Reporting issues

Include the document (or a minimal reproduction), the command you ran, and the
full validator output. For format proposals, describe the use case first —
"as an agent platform, I need to know X before connecting" beats "add field X".
