import type {
  OpenAPISpec,
  OperationGroup,
  Operation,
  Param,
  OperationObject,
  ParameterLike,
  ParameterObject,
  SchemaObject,
  SecurityRequirement,
} from "./types.js";
import { resolveSchema, resolveParameter } from "./refs.js";
import { paramFromSpec, schemaToType } from "./params.js";
import { resolveOperationId } from "./naming.js";

const HTTP_METHODS = ["get", "post", "put", "patch", "delete", "head", "options"] as const;

export function extractOperations(spec: OpenAPISpec): OperationGroup[] {
  const groupMap = new Map<string, Operation[]>();

  for (const [path, pathItem] of Object.entries(spec.paths)) {
    if (!pathItem) continue;

    // Path-level parameters apply to all methods
    const pathParams = pathItem.parameters ?? [];

    for (const method of HTTP_METHODS) {
      const op = pathItem[method] as OperationObject | undefined;
      if (!op) continue;

      const tag = op.tags?.[0] ?? "default";
      const id = resolveOperationId(op.operationId, method, path);
      const params = extractParams(op, pathParams, spec);
      const security = op.security ?? spec.security ?? [];

      const operation: Operation = {
        id,
        method: method.toUpperCase(),
        path,
        summary: op.summary ?? "",
        description: op.description ?? op.summary ?? "",
        params,
        bodyRequired: op.requestBody?.required ?? false,
        security,
      };

      if (!groupMap.has(tag)) {
        groupMap.set(tag, []);
      }
      groupMap.get(tag)!.push(operation);
    }
  }

  const tagDescriptions = new Map<string, string>();
  for (const tag of spec.tags ?? []) {
    tagDescriptions.set(tag.name, tag.description ?? "");
  }

  const groups: OperationGroup[] = [];
  for (const [tag, operations] of groupMap) {
    groups.push({
      tag,
      description: tagDescriptions.get(tag) ?? `Manage ${tag}`,
      operations,
    });
  }

  return groups;
}

/**
 * Every parameter becomes a flag, and a flag name has to be unique across the
 * whole operation — a spec is free to put `id` in the path and again in the
 * body, but `--id` can only mean one of them. So collisions are tracked by name
 * as well as by location, and the first declaration wins: operation-level
 * before path-level before body, which matches the precedence OpenAPI gives
 * them anyway.
 */
function extractParams(
  op: OperationObject,
  pathLevelParams: ParameterLike[],
  spec: OpenAPISpec
): Param[] {
  const params: Param[] = [];
  const seenLocations = new Set<string>();
  const seenNames = new Set<string>();

  const take = (p: ParameterObject): void => {
    seenLocations.add(`${p.in}:${p.name}`);
    seenNames.add(p.name);
    params.push(paramFromSpec(p));
  };

  // Operation-level params override path-level
  for (const rawP of op.parameters ?? []) {
    const p = resolveParameter(rawP, spec);
    if (!p) continue;
    if (seenLocations.has(`${p.in}:${p.name}`) || seenNames.has(p.name)) continue;
    take(p);
  }

  // Add path-level params not overridden
  for (const rawP of pathLevelParams) {
    const p = resolveParameter(rawP, spec);
    if (!p) continue;
    if (seenLocations.has(`${p.in}:${p.name}`) || seenNames.has(p.name)) continue;
    take(p);
  }

  // Extract body params
  if (op.requestBody?.content) {
    const jsonContent = op.requestBody.content["application/json"];
    if (jsonContent?.schema) {
      const schema = resolveSchema(jsonContent.schema, spec);
      if (schema.properties) {
        const requiredFields = schema.required ?? [];
        for (const [name, prop] of Object.entries(schema.properties)) {
          if (seenNames.has(name)) continue;
          seenLocations.add(`body:${name}`);
          seenNames.add(name);
          const resolved = resolveSchema(prop, spec);
          params.push({
            name,
            in: "body",
            type: schemaToType(resolved),
            required: requiredFields.includes(name),
            description: resolved.description ?? "",
            enum: resolved.enum,
            default: resolved.default,
          });
        }
      }
    }
  }

  return params;
}


