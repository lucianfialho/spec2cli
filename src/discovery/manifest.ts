import type { OperationGroup } from "../parser/types.js";
import type { Manifest } from "./types.js";

export function generateManifest(
  groups: OperationGroup[],
  info: { title: string; version: string; description?: string }
): Manifest {
  const totalCommands = groups.reduce((sum, g) => sum + g.operations.length, 0);

  return {
    name: info.title.toLowerCase().replace(/\s+/g, "-"),
    version: info.version,
    description: info.description ?? info.title,
    groups: groups.map((g) => ({
      name: g.tag,
      description: g.description,
      commands: g.operations.length,
    })),
    _meta: {
      protocol: "mcp-c/1",
      total_commands: totalCommands,
    },
  };
}
