export interface FetchJsonOptions {
  timeoutMs?: number;
  /** Injectable for tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
}

/** Maximum accepted response size (1 MiB) — discovery documents are small. */
const MAX_BYTES = 1024 * 1024;

/**
 * Read a response body incrementally, aborting as soon as the byte budget is
 * exceeded — a hostile or misconfigured endpoint must not be buffered in full.
 */
async function readBodyCapped(response: Response, url: string): Promise<string> {
  const declared = response.headers.get("content-length");
  if (declared !== null && Number(declared) > MAX_BYTES) {
    throw new Error(`response from ${url} exceeds ${MAX_BYTES} bytes`);
  }

  const body = response.body;
  if (body === null) {
    // No streamable body (some fetch mocks / empty responses): fall back to
    // text(), still enforcing the cap on the byte length.
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > MAX_BYTES) {
      throw new Error(`response from ${url} exceeds ${MAX_BYTES} bytes`);
    }
    return text;
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > MAX_BYTES) {
        throw new Error(`response from ${url} exceeds ${MAX_BYTES} bytes`);
      }
      chunks.push(value);
    }
  } finally {
    // Stop the underlying transfer if we bailed early.
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  return new TextDecoder("utf-8").decode(Buffer.concat(chunks, received));
}

/** Fetch a URL and parse it as JSON, with timeout and size limits. */
export async function fetchJson(
  url: string,
  options: FetchJsonOptions = {},
): Promise<unknown> {
  const { timeoutMs = 10_000, fetchImpl = fetch } = options;
  const response = await fetchImpl(url, {
    headers: { accept: "application/json" },
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  const text = await readBodyCapped(response, url);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`response from ${url} is not valid JSON`);
  }
}
