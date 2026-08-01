import type { Param } from "../parser/types.js";

/**
 * Every failure used to exit 1, so a caller could not tell a missing flag from
 * a rate limit from an unreachable host — and could not decide whether retrying
 * was worth anything. Each kind gets its own code, and under --output json the
 * failure is emitted as data rather than prose.
 */
export const EXIT = {
  ok: 0,
  generic: 1,
  validation: 2,
  usage: 3,
  auth: 4,
  not_found: 5,
  client_error: 6,
  rate_limited: 7,
  server_error: 8,
  network: 9,
  spec: 10,
} as const;

export type ErrorKind = keyof typeof EXIT;

/** Kinds where the same call, unchanged, may succeed later. */
const RETRYABLE: ReadonlySet<ErrorKind> = new Set<ErrorKind>([
  "rate_limited",
  "server_error",
  "network",
]);

export function classifyStatus(status: number): ErrorKind {
  if (status === 401 || status === 403) return "auth";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "server_error";
  if (status >= 400) return "client_error";
  return "generic";
}

/** Distinguishes a transport failure from a genuine bug in our own code. */
export function classifyThrown(err: unknown): ErrorKind {
  const message = err instanceof Error ? err.message : String(err);
  return /fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|network|socket/i.test(message)
    ? "network"
    : "generic";
}

export interface FailureDetail {
  kind: ErrorKind;
  message: string;
  status?: number;
  body?: unknown;
}

/**
 * Reports a failure and exits.
 *
 * Under --output json the payload goes to stdout: the contract of that flag is
 * that the caller can parse what it gets back, and for an agent a failure is
 * still a result. Human-readable mode keeps writing to stderr as before.
 */
export function fail(output: string, detail: FailureDetail): never {
  const code = EXIT[detail.kind];

  if (output === "json") {
    const payload: Record<string, unknown> = {
      error: {
        kind: detail.kind,
        message: detail.message,
        retryable: RETRYABLE.has(detail.kind),
        exit_code: code,
      },
    };
    if (detail.status !== undefined) (payload.error as Record<string, unknown>).status = detail.status;
    if (detail.body !== undefined) (payload.error as Record<string, unknown>).body = detail.body;
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.error(`Error: ${detail.message}`);
  }

  process.exit(code);
}

/**
 * Reports every missing required input at once, with enough schema for the
 * caller to fill them in and call again — rather than failing on the first one
 * and making it discover the rest a round trip at a time.
 */
export function failMissingInput(output: string, command: string, missing: Param[]): never {
  if (output === "json") {
    console.log(
      JSON.stringify(
        {
          status: "input_required",
          command,
          missing: missing.map((p) => {
            const entry: Record<string, unknown> = { name: p.name, type: p.type, in: p.in };
            if (p.enum) entry.enum = p.enum;
            if (p.description) entry.desc = p.description;
            return entry;
          }),
          exit_code: EXIT.usage,
        },
        null,
        2
      )
    );
  } else {
    const names = missing.map((p) => `--${p.name} <${p.type}>`).join(" ");
    console.error(`Error: ${command} requires ${names}`);
  }

  process.exit(EXIT.usage);
}
