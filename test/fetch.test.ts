import { describe, expect, it } from "vitest";

import { fetchJson } from "../src/fetch.js";

const MIB = 1024 * 1024;

/** Build a fetch stub that returns a streaming Response with the given chunks. */
function fetchStub(
  chunks: Uint8Array[],
  init: ResponseInit = {},
): { impl: typeof fetch; pulled: () => number } {
  let pulled = 0;
  const impl: typeof fetch = async () => {
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (pulled >= chunks.length) {
          controller.close();
          return;
        }
        controller.enqueue(chunks[pulled]!);
        pulled += 1;
      },
    });
    return new Response(body, { status: 200, ...init });
  };
  return { impl, pulled: () => pulled };
}

describe("fetchJson", () => {
  it("parses a small JSON body from a stream", async () => {
    const { impl } = fetchStub([new TextEncoder().encode('{"ok":true}')]);
    await expect(
      fetchJson("https://example.com/.well-known/mcp.json", { fetchImpl: impl }),
    ).resolves.toEqual({ ok: true });
  });

  it("rejects non-2xx responses", async () => {
    const impl: typeof fetch = async () => new Response("nope", { status: 404 });
    await expect(
      fetchJson("https://example.com/x", { fetchImpl: impl }),
    ).rejects.toThrow(/HTTP 404/);
  });

  it("rejects invalid JSON", async () => {
    const { impl } = fetchStub([new TextEncoder().encode("not json")]);
    await expect(
      fetchJson("https://example.com/x", { fetchImpl: impl }),
    ).rejects.toThrow(/not valid JSON/);
  });

  it("rejects oversized bodies without buffering the whole stream", async () => {
    // 4 MiB total, in 64 KiB chunks; the cap is 1 MiB.
    const chunk = new Uint8Array(64 * 1024).fill(0x61);
    const chunks = Array.from({ length: 64 }, () => chunk);
    const { impl, pulled } = fetchStub(chunks);
    await expect(
      fetchJson("https://example.com/huge", { fetchImpl: impl }),
    ).rejects.toThrow(/exceeds 1048576 bytes/);
    // Must have aborted mid-stream: 17 * 64 KiB is the first read over the
    // 1 MiB cap; allow one extra chunk of ReadableStream read-ahead.
    expect(pulled()).toBeLessThanOrEqual(18);
    expect(pulled()).toBeLessThan(chunks.length);
  });

  it("rejects early when content-length already exceeds the cap", async () => {
    const { impl, pulled } = fetchStub(
      [new Uint8Array(10)],
      { headers: { "content-length": String(4 * MIB) } },
    );
    await expect(
      fetchJson("https://example.com/huge", { fetchImpl: impl }),
    ).rejects.toThrow(/exceeds 1048576 bytes/);
    // The body is never read by fetchJson; at most the stream's own eager
    // read-ahead pull may have fired.
    expect(pulled()).toBeLessThanOrEqual(1);
  });

  it("enforces the cap on the fallback path when the response has no stream", async () => {
    const big = "a".repeat(MIB + 1);
    const impl: typeof fetch = async () =>
      ({
        ok: true,
        status: 200,
        headers: new Headers(),
        body: null,
        text: async () => big,
      }) as unknown as Response;
    await expect(
      fetchJson("https://example.com/huge", { fetchImpl: impl }),
    ).rejects.toThrow(/exceeds 1048576 bytes/);
  });
});
