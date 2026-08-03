import type { OpenAPISpec } from "../parser/types.js";

/** Hints derived from the spec itself: how to authenticate, what to call things,
 *  and where the API actually lives. Shared by agent help and command building. */

export function resolveAuthHint(spec: OpenAPISpec): string {
  const schemes = spec.components?.securitySchemes;
  if (!schemes) return "none";

  const apiKeyHeaders: string[] = [];
  for (const scheme of Object.values(schemes)) {
    if (scheme.type === "apiKey" && scheme.in === "header" && scheme.name) {
      apiKeyHeaders.push(scheme.name);
    }
  }

  if (apiKeyHeaders.length > 1) {
    const parts = apiKeyHeaders.map((h) => `--header "${h}: <value>"`).join(" ");
    return `multi-header ${parts}`;
  }

  for (const scheme of Object.values(schemes)) {
    if (scheme.type === "http" && scheme.scheme === "bearer") return "bearer --token <TOKEN>";
    if (scheme.type === "http" && scheme.scheme === "basic") return "basic --basic <USER:PASSWORD>";
    if (scheme.type === "apiKey") return `apiKey --api-key <KEY> (header: ${scheme.name})`;
  }

  return "none";
}

export function simplifyName(operationId: string, tag: string): string {
  const tagLower = tag.toLowerCase();
  const idLower = operationId.toLowerCase();
  const singular = tagLower.endsWith("s") ? tagLower.slice(0, -1) : tagLower;

  for (const suffix of [tagLower, singular]) {
    if (idLower.endsWith(suffix) && idLower.length > suffix.length) {
      return operationId.slice(0, operationId.length - suffix.length).toLowerCase();
    }
  }
  return operationId.toLowerCase();
}

export function resolveBaseUrl(spec: OpenAPISpec, specSource: string): string {
  const serverUrl = spec.servers?.[0]?.url;

  if (serverUrl?.startsWith("http://") || serverUrl?.startsWith("https://")) {
    return serverUrl;
  }

  if (serverUrl && specSource.startsWith("http")) {
    try {
      const origin = new URL(specSource).origin;
      return origin + (serverUrl.startsWith("/") ? serverUrl : "/" + serverUrl);
    } catch {
      // fall through
    }
  }

  if (specSource.startsWith("http")) {
    try {
      return new URL(specSource).origin;
    } catch {
      // fall through
    }
  }

  return "http://localhost:3000";
}
