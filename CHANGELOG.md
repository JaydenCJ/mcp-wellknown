# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Until 1.0, breaking schema changes may land in minor versions as the upstream
MCP capability-discovery discussion evolves.

## [Unreleased]

## [0.1.0] - 2026-07-08

### Added

- Reference JSON Schema (draft 2020-12) for `.well-known/mcp.json` at
  `schemas/mcp-wellknown.schema.json`, covering `name`, `description`,
  `version`, `spec_version`, `servers[]` (endpoint, transport, authentication,
  capabilities, docs), `contact`, and `updated_at`, with matching TypeScript
  types.
- `validateDocument()`: structural validation via Ajv (2020-12 dialect) plus
  semantic checks — HTTPS-only endpoints, unique server names, semver
  `version`, date-based `spec_version`, ISO 8601 `updated_at` — every issue
  reported with a JSON Pointer path and a fix suggestion; freshness,
  `oauth2`, `docs`, and `contact` hygiene reported as warnings.
- CLI (`mcp-wellknown`) with five subcommands:
  - `init` — flag-driven scaffolding of `mcp-wellknown.config.json`;
  - `generate` — config to validated `.well-known/mcp.json` with automatic
    `updated_at` stamping (refuses to write invalid documents);
  - `validate <file|url>` — CI-friendly exit codes and `--json` output;
  - `inspect <domain>` — capability summary from a live domain or `--file`;
  - `crawl <domains.txt>` — batch fetch into `index.json` plus a
    self-contained static `index.html` directory page, with `--offline` mode.
- Library API exporting the schema, validator, generator, inspector, and
  crawler (`crawlDomains`, `offlineLoader`, `httpLoader`, `renderIndexHtml`,
  `writeIndex`, …).
- Offline test suite: valid/invalid fixtures, per-rule semantic tests,
  generate-to-validate round-trips, offline crawl aggregation, and compiled
  CLI smoke tests.
- Examples (`examples/`) usable fully offline, and trilingual documentation
  (English, Simplified Chinese, Japanese).

[Unreleased]: https://github.com/JaydenCJ/mcp-wellknown/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/JaydenCJ/mcp-wellknown/releases/tag/v0.1.0
