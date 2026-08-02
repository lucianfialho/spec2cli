import { simplifyName } from "./agent-help.js";
import type { OperationGroup } from "../parser/types.js";

export { simplifyName };

/**
 * Names every command in a group, guaranteeing they are distinct.
 *
 * simplifyName strips the tag from the operationId, which readily collapses two
 * operations onto one name — `searchItems` and `searchItem` under the `items`
 * tag both become `search`. Commander rejects the duplicate by throwing while
 * the command tree is being built, which kills the process before any command
 * runs: a single colliding pair makes the whole CLI unusable for that spec,
 * `--help` included.
 *
 * Colliding names are disambiguated by HTTP method first, since that is what
 * usually distinguishes them and it reads well. A numeric suffix covers
 * whatever still overlaps after that.
 */
export function commandNamesForGroup(group: OperationGroup): string[] {
  const baseNames = group.operations.map((op) => simplifyName(op.id, group.tag));

  const baseCounts = new Map<string, number>();
  for (const name of baseNames) {
    baseCounts.set(name, (baseCounts.get(name) ?? 0) + 1);
  }

  const used = new Map<string, number>();
  return group.operations.map((op, index) => {
    const baseName = baseNames[index];
    const collides = (baseCounts.get(baseName) ?? 0) > 1;
    const preferred = collides ? `${baseName}-${op.method.toLowerCase()}` : baseName;

    const seen = used.get(preferred) ?? 0;
    used.set(preferred, seen + 1);
    return seen === 0 ? preferred : `${preferred}-${seen + 1}`;
  });
}
