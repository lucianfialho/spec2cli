import { resolveAuthHint, simplifyName } from "./spec-hints.js";
import { FLAGS, firstLine } from "./agent-help-shared.js";
import type { OperationGroup, OpenAPISpec } from "../parser/types.js";

/**
 * Every command with its parameters, in one payload — what --agent-help emitted
 * before it was served progressively. Kept as an escape hatch, and as the
 * baseline the bench harness measures progressive disclosure against.
 */
export function fullDump(groups: OperationGroup[], spec: OpenAPISpec): Record<string, unknown> {
  const commands: Record<string, unknown> = {};

  for (const group of groups) {
    const groupCmds: Record<string, unknown> = {};

    for (const op of group.operations) {
      const cmd: Record<string, unknown> = {
        method: op.method,
        desc: firstLine(op.summary || op.description),
      };

      const required = op.params.filter((p) => p.required);
      const optional = op.params.filter((p) => !p.required);

      if (required.length > 0) {
        cmd.required = required.map((p) => {
          const entry: Record<string, unknown> = { name: p.name, type: p.type };
          if (p.enum) entry.enum = p.enum;
          return entry;
        });
      }

      if (optional.length > 0) {
        cmd.optional = optional.map((p) => {
          const entry: Record<string, unknown> = { name: p.name, type: p.type };
          if (p.enum) entry.enum = p.enum;
          if (p.default !== undefined) entry.default = p.default;
          return entry;
        });
      }

      groupCmds[simplifyName(op.id, group.tag)] = cmd;
    }

    commands[group.tag] = groupCmds;
  }

  return {
    api: spec.info.title,
    base_url: spec.servers?.[0]?.url ?? "http://localhost:3000",
    auth: resolveAuthHint(spec),
    flags: FLAGS,
    commands,
  };
}
