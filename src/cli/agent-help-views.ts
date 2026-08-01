import { resolveAuthHint, simplifyName } from "./spec-hints.js";
import { FLAGS, firstLine, normalizeBlock } from "./agent-help-shared.js";
import type { Operation, OperationGroup, OpenAPISpec, Param } from "../parser/types.js";

/** Root: everything the agent needs to navigate, nothing it needs to act. */
export function describeRoot(groups: OperationGroup[], spec: OpenAPISpec): Record<string, unknown> {
  const groupList: Record<string, string> = {};
  for (const g of groups) {
    const n = g.operations.length;
    groupList[g.tag] = `${n} command${n === 1 ? "" : "s"}`;
  }

  return {
    api: spec.info.title,
    base_url: spec.servers?.[0]?.url ?? "http://localhost:3000",
    auth: resolveAuthHint(spec),
    groups: groupList,
    drill_down: {
      "list a group's commands": "--agent-help <group>",
      "full detail for one command": "--agent-help <group> <command>",
      "search every group": '--agent-help --find "<query>"',
      "dump everything at once": "--agent-help --all",
    },
    flags: FLAGS,
  };
}

/** Group: command names and one-line summaries. No parameters yet. */
export function describeGroup(group: OperationGroup, spec: OpenAPISpec): Record<string, unknown> {
  const commands: Record<string, string> = {};
  for (const op of group.operations) {
    commands[simplifyName(op.id, group.tag)] = `${op.method} — ${firstLine(op.summary || op.description)}`;
  }

  return {
    api: spec.info.title,
    group: group.tag,
    commands,
    next: `--agent-help ${group.tag} <command>  (parameters and full description)`,
  };
}

/** Command: the full picture, including descriptions a summary would drop. */
export function describeOp(
  op: Operation,
  group: OperationGroup,
  spec: OpenAPISpec
): Record<string, unknown> {
  const name = simplifyName(op.id, group.tag);
  const detail: Record<string, unknown> = {
    api: spec.info.title,
    group: group.tag,
    command: name,
    method: op.method,
    path: op.path,
  };

  const desc = normalizeBlock(op.description || op.summary);
  if (desc) detail.desc = desc;

  const required = op.params.filter((p) => p.required);
  const optional = op.params.filter((p) => !p.required);
  if (required.length > 0) detail.required = required.map(describeParam);
  if (optional.length > 0) detail.optional = optional.map(describeParam);

  detail.example = [
    `spec2cli ${group.tag} ${name}`,
    ...required.map((p) => `--${p.name} <${p.type}>`),
  ].join(" ");

  return detail;
}

function describeParam(p: Param): Record<string, unknown> {
  const entry: Record<string, unknown> = { name: p.name, type: p.type };
  if (p.enum) entry.enum = p.enum;
  if (p.default !== undefined) entry.default = p.default;
  if (p.description) entry.desc = p.description;
  return entry;
}

/** Search: group-level detail for matches across every group. */
export function searchOps(
  groups: OperationGroup[],
  spec: OpenAPISpec,
  query: string
): Record<string, unknown> {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const matches: Record<string, string> = {};

  for (const group of groups) {
    for (const op of group.operations) {
      const name = simplifyName(op.id, group.tag);
      const haystack = [op.id, name, op.summary, op.description, op.path].join(" ").toLowerCase();
      if (terms.every((t) => haystack.includes(t))) {
        matches[`${group.tag} ${name}`] = `${op.method} — ${firstLine(op.summary || op.description)}`;
      }
    }
  }

  return {
    api: spec.info.title,
    query,
    matches: Object.keys(matches).length > 0 ? matches : "no matches",
    next: "--agent-help <group> <command>  (parameters and full description)",
  };
}
