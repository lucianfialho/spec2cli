import type { OpenAPISpec, ParameterLike, ParameterObject, SchemaObject } from "./types.js";

/**
 * Walks a local JSON Pointer.
 *
 * The `~1` and `~0` escapes are not decoration: a pointer into `paths` has to
 * write `/` as `~1`, so `#/paths/~1pets/get` is the only way to reference the
 * `/pets` path item. Without decoding them the walk silently misses and the
 * caller falls back to an unresolved `$ref`.
 *
 * Returns undefined rather than walking into a non-object, so a pointer aimed
 * at something that is not there fails visibly instead of yielding a partial.
 */
function followPointer(ref: string, spec: OpenAPISpec): unknown {
  if (!ref.startsWith("#/")) return undefined;

  const parts = ref
    .slice(2)
    .split("/")
    .map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"));

  let resolved: unknown = spec;
  for (const part of parts) {
    if (resolved === null || typeof resolved !== "object") return undefined;
    resolved = (resolved as Record<string, unknown>)[part];
  }
  return resolved;
}

export function resolveSchema(schema: SchemaObject, spec: OpenAPISpec): SchemaObject {
  if (!schema.$ref) return schema;
  return (followPointer(schema.$ref, spec) as SchemaObject) ?? schema;
}

/**
 * Resolves a parameter that may be a `$ref`, or undefined if it resolves to
 * something that is not a parameter. Callers skip those: a half-formed entry
 * would otherwise become a flag named `undefined`.
 */
export function resolveParameter(
  param: ParameterLike,
  spec: OpenAPISpec
): ParameterObject | undefined {
  if ("$ref" in param && typeof param.$ref === "string") {
    const resolved = followPointer(param.$ref, spec);
    return isParameterObject(resolved) ? resolved : undefined;
  }
  return isParameterObject(param) ? param : undefined;
}

function isParameterObject(value: unknown): value is ParameterObject {
  const param = value as Partial<ParameterObject> | undefined;
  return typeof param?.name === "string" && typeof param?.in === "string";
}
