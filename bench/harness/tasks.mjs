// Phase B task set. Each task must be solvable only through the tools, so the
// arms are compared on tool use rather than on what the model already knows.
export const TASKS = [
  {
    id: "math-chain",
    prompt:
      "Using only the available tools (do not compute mentally), multiply 847 by 293, " +
      "then subtract 1171 from that result. Report the final number.",
    expect: "247000",
  },
  {
    id: "nixos-lookup",
    prompt:
      "Using only the available tools, find how many options the NixOS unstable channel has. " +
      "Report the number.",
    expect: /\d{2},?\d{3}/,
  },
  {
    id: "cross-server",
    prompt:
      "Using only the available tools: get the number of NixOS packages in the unstable " +
      "channel, and separately count how many departments the Metropolitan Museum has. " +
      "Report both numbers.",
    expect: /\d{3},?\d{3}/,
  },
];

/**
 * The CLI arm is told the tool exists and how to discover it — the equivalent of
 * what an MCP client injects. It is not given the catalog itself; that is the
 * cli-flat arm, which exists to separate "CLI vs MCP" from "progressive vs flat".
 */
export function cliPreamble(cli, spec) {
  return (
    `A command-line tool exposes every API operation you need:\n\n` +
    `  node ${cli} --spec ${spec} <group> <command> [--flag value]\n\n` +
    `Discover what it offers with --agent-help, which is served progressively:\n` +
    `  --agent-help --progressive    lists groups and how many commands each has\n` +
    `  --agent-help <group>          lists that group's commands\n` +
    `  --agent-help <group> <cmd>    full parameters for one command\n` +
    `  --agent-help --find "<query>" searches every group\n\n` +
    `Add --output json for machine-readable results. Do not compute anything yourself.\n\n`
  );
}

export function flatPreamble(cli, spec, catalog) {
  return (
    `A command-line tool exposes every API operation you need:\n\n` +
    `  node ${cli} --spec ${spec} <group> <command> [--flag value]\n\n` +
    `Add --output json for machine-readable results. Do not compute anything ` +
    `yourself. Here is the complete catalog:\n\n${catalog}\n\n`
  );
}
