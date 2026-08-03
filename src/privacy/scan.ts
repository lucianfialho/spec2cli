import { scanSchema } from "@lucianfialho/pii-filter";
import type { OpenAPISpec } from "../parser/types.js";

export interface PiiFinding {
  /** Dot-notation path, e.g. `Customer.email`. */
  path: string;
  schema: string;
  field: string;
}

/**
 * Lists the fields `--filter-pii` would redact.
 *
 * Enabling the filter without being able to see what it touches is a bad trade:
 * too little and personal data reaches the model anyway, too much and a field
 * the caller needed comes back as `[REDACTED]` with no hint why. Findings are
 * grouped by schema so a spec can be reviewed a type at a time.
 */
export function scanSpecForPii(spec: OpenAPISpec): PiiFinding[] {
  const schemas = spec.components?.schemas;
  if (!schemas) return [];

  return scanSchema(schemas as Record<string, unknown>).map((path) => {
    const dot = path.indexOf(".");
    return {
      path,
      schema: dot === -1 ? path : path.slice(0, dot),
      field: dot === -1 ? path : path.slice(dot + 1),
    };
  });
}

/** Groups findings by the schema they belong to, preserving discovery order. */
export function groupBySchema(findings: PiiFinding[]): Map<string, string[]> {
  const grouped = new Map<string, string[]>();
  for (const f of findings) {
    const fields = grouped.get(f.schema) ?? [];
    fields.push(f.field);
    grouped.set(f.schema, fields);
  }
  return grouped;
}

/** Which operations return a schema carrying flagged fields. */
export function operationsExposing(spec: OpenAPISpec, schemas: Set<string>): string[] {
  const exposed = new Set<string>();

  for (const [path, item] of Object.entries(spec.paths ?? {})) {
    if (!item) continue;
    for (const [method, op] of Object.entries(item)) {
      if (method === "parameters" || !op || typeof op !== "object") continue;
      const responses = (op as { responses?: Record<string, unknown> }).responses ?? {};
      const body = JSON.stringify(responses);
      for (const schema of schemas) {
        if (body.includes(`/schemas/${schema}"`)) {
          exposed.add(`${method.toUpperCase()} ${path}`);
        }
      }
    }
  }

  return [...exposed];
}
