import { stringify as toYaml } from "yaml";
import { VALUE_FLAGS } from "./flags.js";
import { simplifyName } from "./spec-hints.js";
import { findGroup, findOp } from "./agent-help-shared.js";
import { describeRoot, describeGroup, describeOp, searchOps } from "./agent-help-views.js";
import { fullDump } from "./agent-help-full.js";
import type { OperationGroup, OpenAPISpec } from "../parser/types.js";

export { resolveAuthHint, simplifyName, resolveBaseUrl } from "./spec-hints.js";

/**
 * Agent help is served progressively. A spec with 1000 operations costs ~84k
 * tokens to dump in full, which is the same context-coupling problem MCP has.
 * The root level lists groups only; the agent drills into a group, then into a
 * single command, paying for detail just where it decided to act.
 *
 * Because only one operation is expanded at a time, the detail level can afford
 * full descriptions — the parameter semantics that a truncated summary drops.
 */
export interface AgentHelpSelector {
  group?: string;
  command?: string;
  find?: string;
  all?: boolean;
}

/**
 * Reads the drill-down target out of argv. Only reached when --agent-help is
 * present, which short-circuits command dispatch — so --all and --find here can
 * never collide with a parameter of the same name on a real operation.
 */
export function parseAgentHelpSelector(args: string[]): AgentHelpSelector {
  const selector: AgentHelpSelector = {};
  const positionals: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (VALUE_FLAGS.has(arg)) {
      i++;
      continue;
    }
    if (arg === "--all") {
      selector.all = true;
      continue;
    }
    if (arg === "--find") {
      selector.find = args[i + 1];
      i++;
      continue;
    }
    if (!arg.startsWith("-")) positionals.push(arg);
  }

  if (positionals[0]) selector.group = positionals[0];
  if (positionals[1]) selector.command = positionals[1];
  return selector;
}

export function printAgentHelp(
  groups: OperationGroup[],
  spec: OpenAPISpec,
  selector: AgentHelpSelector = {}
): void {
  console.log(toYaml(buildAgentHelp(groups, spec, selector)));
}

function buildAgentHelp(
  groups: OperationGroup[],
  spec: OpenAPISpec,
  selector: AgentHelpSelector
): Record<string, unknown> {
  if (selector.all) return fullDump(groups, spec);
  if (selector.find) return searchOps(groups, spec, selector.find);
  if (!selector.group) return describeRoot(groups, spec);

  const group = findGroup(groups, selector.group);
  if (!group) {
    return { error: `unknown group: ${selector.group}`, groups: groups.map((g) => g.tag) };
  }

  if (!selector.command) return describeGroup(group, spec);

  const op = findOp(group, selector.command);
  if (!op) {
    return {
      error: `unknown command: ${selector.command}`,
      group: group.tag,
      commands: group.operations.map((o) => simplifyName(o.id, group.tag)),
    };
  }

  return describeOp(op, group, spec);
}
