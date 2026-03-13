import type { OperationGroup } from "../parser/types.js";
import type { GroupDetail, GroupCommand } from "./types.js";

export function generateGroupDetail(group: OperationGroup): GroupDetail {
  return {
    group: group.tag,
    commands: group.operations.map((op): GroupCommand => {
      const args = op.params
        .filter((p) => p.in === "path")
        .map((p) => p.name);

      return {
        name: simplifyName(op.id, group.tag),
        description: op.summary || op.description,
        method: op.method,
        hint: methodToHint(op.method),
        ...(args.length > 0 ? { args } : {}),
      };
    }),
  };
}

function methodToHint(method: string): GroupCommand["hint"] {
  switch (method) {
    case "GET":
    case "HEAD":
      return "read-only";
    case "DELETE":
      return "destructive";
    default:
      return "write";
  }
}

function simplifyName(operationId: string, tag: string): string {
  // Remove tag prefix: "listPets" with tag "pets" → "list"
  const tagLower = tag.toLowerCase();
  const idLower = operationId.toLowerCase();

  // Try removing singular and plural forms of tag
  const singular = tagLower.endsWith("s") ? tagLower.slice(0, -1) : tagLower;

  for (const suffix of [tagLower, singular]) {
    if (idLower.endsWith(suffix) && idLower.length > suffix.length) {
      return operationId.slice(0, operationId.length - suffix.length).toLowerCase();
    }
  }

  return operationId.toLowerCase();
}
