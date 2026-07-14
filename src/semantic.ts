import type {
  McpWellKnownDocument,
  ValidationIssue,
} from "./types.js";

const SEMVER_RE =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

const SPEC_VERSION_RE = /^\d{4}-\d{2}-\d{2}$/;

const ISO8601_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

/** Allowed clock skew before a future `updated_at` triggers a warning. */
const FUTURE_SKEW_MS = 5 * 60 * 1000;

export interface SemanticFindings {
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

function isValidCalendarDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

function parseUrl(value: string): URL | undefined {
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}

/**
 * Semantic checks that go beyond what JSON Schema can express. Assumes the
 * input already passed structural validation against the reference schema.
 */
export function semanticIssues(
  doc: McpWellKnownDocument,
  now: Date = new Date(),
): SemanticFindings {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  // version: semantic versioning
  if (doc.version !== undefined && !SEMVER_RE.test(doc.version)) {
    errors.push({
      path: "/version",
      code: "semantic/version-semver",
      message: `"version" must be a semantic version, got "${doc.version}"`,
      suggestion: 'Use MAJOR.MINOR.PATCH, e.g. "1.0.0". A leading "v" is not allowed.',
    });
  }

  // spec_version: date-based MCP revision
  if (!SPEC_VERSION_RE.test(doc.spec_version)) {
    errors.push({
      path: "/spec_version",
      code: "semantic/spec-version-format",
      message: `"spec_version" must be a date-based MCP specification revision (YYYY-MM-DD), got "${doc.spec_version}"`,
      suggestion: 'Use the revision date of the MCP specification you target, e.g. "2025-06-18".',
    });
  } else if (!isValidCalendarDate(doc.spec_version)) {
    errors.push({
      path: "/spec_version",
      code: "semantic/spec-version-date",
      message: `"spec_version" is not a valid calendar date: "${doc.spec_version}"`,
      suggestion: 'Use a real date in YYYY-MM-DD form, e.g. "2025-06-18".',
    });
  }

  // updated_at: ISO 8601 timestamp, not (meaningfully) in the future
  if (doc.updated_at === undefined) {
    warnings.push({
      path: "/updated_at",
      code: "semantic/updated-at-missing",
      message: '"updated_at" is missing; crawlers use it to judge freshness',
      suggestion: 'Add an ISO 8601 timestamp, or run "mcp-wellknown generate" which stamps it automatically.',
    });
  } else if (
    !ISO8601_RE.test(doc.updated_at) ||
    Number.isNaN(Date.parse(doc.updated_at))
  ) {
    errors.push({
      path: "/updated_at",
      code: "semantic/updated-at-iso8601",
      message: `"updated_at" must be an ISO 8601 timestamp, got "${doc.updated_at}"`,
      suggestion: 'Use e.g. "2026-07-01T12:00:00Z" (date-only values and free-form text are not accepted).',
    });
  } else if (Date.parse(doc.updated_at) > now.getTime() + FUTURE_SKEW_MS) {
    warnings.push({
      path: "/updated_at",
      code: "semantic/updated-at-future",
      message: `"updated_at" is in the future (${doc.updated_at})`,
      suggestion: "Stamp the document with the actual time of the last change.",
    });
  }

  // contact: mailto: or https://
  if (
    doc.contact !== undefined &&
    !doc.contact.startsWith("mailto:") &&
    !doc.contact.startsWith("https://")
  ) {
    warnings.push({
      path: "/contact",
      code: "semantic/contact-scheme",
      message: `"contact" should be a mailto: URI or an https:// URL, got "${doc.contact}"`,
      suggestion: 'Use e.g. "mailto:mcp@example.com" or "https://example.com/contact".',
    });
  }

  // servers: unique names, https endpoints, auth hygiene
  const seenNames = new Map<string, number>();
  doc.servers.forEach((server, i) => {
    const base = `/servers/${i}`;

    const firstIndex = seenNames.get(server.name);
    if (firstIndex !== undefined) {
      errors.push({
        path: `${base}/name`,
        code: "semantic/server-name-unique",
        message: `duplicate server name "${server.name}" (already used at /servers/${firstIndex}/name)`,
        suggestion: "Give every server a unique name so clients can address them unambiguously.",
      });
    } else {
      seenNames.set(server.name, i);
    }

    const endpoint = parseUrl(server.endpoint);
    if (!endpoint) {
      errors.push({
        path: `${base}/endpoint`,
        code: "semantic/endpoint-url",
        message: `"endpoint" is not a valid URL: "${server.endpoint}"`,
        suggestion: 'Use an absolute HTTPS URL, e.g. "https://mcp.example.com/mcp".',
      });
    } else if (endpoint.protocol !== "https:") {
      errors.push({
        path: `${base}/endpoint`,
        code: "semantic/endpoint-https",
        message: `"endpoint" must use https://, got "${endpoint.protocol}//"`,
        suggestion:
          "Publish only TLS endpoints in discovery documents. Plaintext endpoints (including http://localhost) must not be advertised.",
      });
    }

    if (server.docs !== undefined) {
      const docs = parseUrl(server.docs);
      if (!docs || docs.protocol !== "https:") {
        warnings.push({
          path: `${base}/docs`,
          code: "semantic/docs-https",
          message: `"docs" should be an https:// URL, got "${server.docs}"`,
          suggestion: "Link documentation over TLS so agents can safely surface it to users.",
        });
      }
    }

    if (
      server.authentication?.type === "oauth2" &&
      server.authentication.authorization_server === undefined
    ) {
      warnings.push({
        path: `${base}/authentication`,
        code: "semantic/oauth2-authorization-server",
        message: 'authentication type is "oauth2" but "authorization_server" is not set',
        suggestion:
          "Add the OAuth 2.0 authorization server issuer URL so clients can complete the flow without out-of-band configuration.",
      });
    }
  });

  return { errors, warnings };
}
