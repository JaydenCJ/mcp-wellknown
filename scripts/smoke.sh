#!/usr/bin/env bash
# Smoke test: exercises the built CLI end to end, fully offline.
# Run from anywhere: bash scripts/smoke.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLI="$ROOT/dist/cli.js"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

fail() {
  echo "SMOKE FAIL: $1" >&2
  exit 1
}

[ -f "$CLI" ] || fail "dist/cli.js not found — run 'npm run build' first"

echo "[smoke] work dir: $WORK"

# 1. --version matches package.json
pkg_version="$(node -p "JSON.parse(require('fs').readFileSync('$ROOT/package.json','utf8')).version")"
cli_version="$(node "$CLI" --version)"
[ "$cli_version" = "$pkg_version" ] || fail "--version mismatch: cli=$cli_version pkg=$pkg_version"
echo "[smoke] --version -> $cli_version (matches package.json)"

# 2. --help mentions every subcommand
help_out="$(node "$CLI" --help)"
for cmd in init generate validate inspect crawl; do
  echo "$help_out" | grep -q "$cmd" || fail "--help does not mention '$cmd'"
done
echo "[smoke] --help lists all 5 subcommands"

# 3. init -> generate -> validate round-trip on a fresh input
cd "$WORK"
node "$CLI" init --name "Smoke Test Org" \
  --endpoint https://mcp.smoke.example/mcp \
  --capabilities tools,resources --contact mailto:mcp@smoke.example >/dev/null
[ -f mcp-wellknown.config.json ] || fail "init did not write mcp-wellknown.config.json"
node "$CLI" generate >/dev/null
[ -f .well-known/mcp.json ] || fail "generate did not write .well-known/mcp.json"
grep -q '"Smoke Test Org"' .well-known/mcp.json || fail "generated document lost the publisher name"
grep -q '"updated_at"' .well-known/mcp.json || fail "generate did not stamp updated_at"
out="$(node "$CLI" validate .well-known/mcp.json)"
echo "$out" | grep -q "OK: document is valid" || fail "validate rejected a generated document: $out"
echo "[smoke] init -> generate -> validate round-trip OK"

# 4. validate rejects a bad document with exit code 1
rc=0
node "$CLI" validate "$ROOT/test/fixtures/invalid/http-endpoint.json" >invalid.out 2>&1 || rc=$?
[ "$rc" -eq 1 ] || fail "validate exit code for invalid doc: expected 1, got $rc"
grep -q "INVALID: 1 error(s)" invalid.out || fail "validate did not report the http endpoint error"
grep -q "must use https://" invalid.out || fail "validate error message missing https hint"
echo "[smoke] validate rejects http:// endpoint with exit 1"

# 5. missing file produces a readable error on stderr, exit != 0
rc=0
node "$CLI" validate ./does-not-exist.json >stdout.out 2>stderr.out || rc=$?
[ "$rc" -ne 0 ] || fail "validate of a missing file exited 0"
grep -q "cannot read" stderr.out || fail "missing-file error not on stderr"
echo "[smoke] missing file -> readable error on stderr, exit $rc"

# 6. inspect --file summarizes the bundled example
inspect_out="$(node "$CLI" inspect --file "$ROOT/examples/mcp.json")"
echo "$inspect_out" | grep -q "Servers (2):" || fail "inspect did not list 2 servers"
echo "$inspect_out" | grep -q "streamable-http" || fail "inspect did not show the transport"
echo "[smoke] inspect --file summarizes the example document"

# 7. crawl --offline builds index.json + index.html
node "$CLI" crawl "$ROOT/examples/domains.txt" \
  --offline "$ROOT/examples/offline" --out "$WORK/site" >crawl.out
grep -q "Crawled 3 domain(s): 3 reachable, 3 valid." crawl.out || fail "crawl summary wrong: $(cat crawl.out)"
[ -f "$WORK/site/index.json" ] || fail "crawl did not write index.json"
[ -f "$WORK/site/index.html" ] || fail "crawl did not write index.html"
node -e "
  const idx = JSON.parse(require('fs').readFileSync('$WORK/site/index.json', 'utf8'));
  if (idx.total !== 3 || idx.valid !== 3) process.exit(1);
  if (!idx.entries.some((e) => e.domain === 'example.com' && e.ok)) process.exit(1);
" || fail "index.json content assertions failed"
echo "[smoke] crawl --offline built a valid index (3/3 domains)"

echo "SMOKE OK"
