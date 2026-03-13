import type { Operation, OpenAPISpec, SecurityScheme } from "../parser/types.js";
import type { CommandSchema, CommandParam } from "./types.js";

export function generateCommandSchema(
  op: Operation,
  groupName: string,
  spec?: OpenAPISpec
): CommandSchema {
  const params: CommandParam[] = op.params.map((p) => ({
    name: p.name,
    type: p.type,
    required: p.required,
    description: p.description,
    ...(p.enum ? { enum: p.enum } : {}),
    ...(p.default !== undefined ? { default: p.default } : {}),
  }));

  const authInfo = resolveAuth(op, spec);

  const commandName = simplifyName(op.id, groupName);

  return {
    command: `${groupName}.${commandName}`,
    description: op.description || op.summary,
    params,
    auth: authInfo,
  };
}

function resolveAuth(
  op: Operation,
  spec?: OpenAPISpec
): { required: boolean; scheme: string } {
  if (op.security.length === 0) {
    return { required: false, scheme: "none" };
  }

  const securitySchemes = spec?.components?.securitySchemes;
  if (!securitySchemes) {
    return { required: true, scheme: "unknown" };
  }

  // Use the first security requirement
  const firstReq = op.security[0];
  const schemeName = Object.keys(firstReq)[0];
  const schemeObj = securitySchemes[schemeName] as SecurityScheme | undefined;

  if (!schemeObj) {
    return { required: true, scheme: "unknown" };
  }

  if (schemeObj.type === "http" && schemeObj.scheme === "bearer") {
    return { required: true, scheme: "bearer" };
  }

  if (schemeObj.type === "apiKey") {
    return { required: true, scheme: `apiKey:${schemeObj.in}:${schemeObj.name}` };
  }

  if (schemeObj.type === "http" && schemeObj.scheme === "basic") {
    return { required: true, scheme: "basic" };
  }

  return { required: true, scheme: schemeObj.type };
}

function simplifyName(operationId: string, tag: string): string {
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
