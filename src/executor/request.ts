import { maskToken } from "../auth/config.js";
import type { Operation } from "../parser/types.js";
import type { AuthConfig } from "./types.js";

/**
 * One description of the HTTP request an operation produces. Both the executor
 * and --dry-run read from here: when they each built their own, they drifted —
 * dry-run dropped the spec's header params and printed auth values in the clear
 * while the executor masked them.
 */
export interface BuiltRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: Record<string, unknown>;
}

export function buildRequest(
  op: Operation,
  params: Record<string, unknown>,
  auth: AuthConfig,
  baseUrl: string
): BuiltRequest {
  return {
    method: op.method,
    url: buildUrl(op, params, baseUrl),
    headers: buildHeaders(op, params, auth),
    body: buildBody(op, params),
  };
}

export function buildUrl(op: Operation, params: Record<string, unknown>, baseUrl: string): string {
  let path = op.path;
  for (const p of op.params) {
    if (p.in === "path" && params[p.name] !== undefined) {
      path = path.replace(`{${p.name}}`, String(params[p.name]));
    }
  }

  // Ensure baseUrl trailing slash doesn't break path joining
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const url = new URL(normalizedBase + path);
  recoverQueryFromFragment(url);

  for (const p of op.params) {
    if (p.in === "query" && params[p.name] !== undefined) {
      url.searchParams.set(p.name, String(params[p.name]));
    }
  }

  return url.toString();
}

/**
 * Specs written by hand sometimes carry query defaults after a `#`, which URL
 * parses as a fragment and never sends. When the fragment reads like a query
 * string, treat it as one — anything explicitly passed still wins, since the
 * caller's parameters are applied afterwards.
 */
function recoverQueryFromFragment(url: URL): void {
  if (!url.hash) return;

  const fragment = url.hash.slice(1);
  if (!fragment.includes("=")) return;

  for (const [name, value] of new URLSearchParams(fragment)) {
    if (!url.searchParams.has(name)) url.searchParams.set(name, value);
  }
  url.hash = "";
}

export function buildHeaders(
  op: Operation,
  params: Record<string, unknown>,
  auth: AuthConfig
): Record<string, string> {
  const headers: Record<string, string> = {};

  if (["POST", "PUT", "PATCH"].includes(op.method)) {
    headers["Content-Type"] = "application/json";
  }
  headers["Accept"] = "application/json";

  for (const p of op.params) {
    if (p.in === "header" && params[p.name] !== undefined) {
      headers[p.name] = String(params[p.name]);
    }
  }

  switch (auth.type) {
    case "bearer":
      headers["Authorization"] = `Bearer ${auth.value}`;
      break;
    case "apiKey":
      headers[auth.headerName ?? "X-API-Key"] = auth.value;
      break;
    case "basic":
      headers["Authorization"] = `Basic ${Buffer.from(auth.value).toString("base64")}`;
      break;
    case "headers":
      if (auth.headers) {
        for (const [k, v] of Object.entries(auth.headers)) headers[k] = v;
      }
      break;
  }

  return headers;
}

export function buildBody(
  op: Operation,
  params: Record<string, unknown>
): Record<string, unknown> | undefined {
  if (!["POST", "PUT", "PATCH"].includes(op.method)) return undefined;

  const bodyParams = op.params.filter((p) => p.in === "body");
  if (bodyParams.length === 0) return undefined;

  const body: Record<string, unknown> = {};
  for (const p of bodyParams) {
    if (params[p.name] !== undefined) body[p.name] = params[p.name];
  }

  return Object.keys(body).length > 0 ? body : undefined;
}

/** Header names carrying a credential, lowercased, for whichever auth is in use. */
export function authHeaderNames(auth: AuthConfig): Set<string> {
  const names = new Set<string>();
  switch (auth.type) {
    case "bearer":
    case "basic":
      names.add("authorization");
      break;
    case "apiKey":
      names.add((auth.headerName ?? "X-API-Key").toLowerCase());
      break;
    case "headers":
      if (auth.headers) {
        for (const name of Object.keys(auth.headers)) names.add(name.toLowerCase());
      }
      break;
  }
  return names;
}

/** Redacts credential-bearing headers, preserving any scheme prefix. */
export function maskAuthHeaders(
  headers: Record<string, string>,
  auth: AuthConfig
): Record<string, string> {
  const secret = authHeaderNames(auth);
  const masked: Record<string, string> = {};

  for (const [name, value] of Object.entries(headers)) {
    if (!secret.has(name.toLowerCase())) {
      masked[name] = value;
      continue;
    }
    const [scheme, ...rest] = value.split(" ");
    masked[name] =
      rest.length > 0 ? `${scheme} ${maskToken(rest.join(" "))}` : maskToken(value);
  }

  return masked;
}
