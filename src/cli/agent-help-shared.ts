import { simplifyName } from "./spec-hints.js";
import type { Operation, OperationGroup } from "../parser/types.js";

export const FLAGS = {
  "--output": "json | pretty | table | yaml | quiet",
  "--dry-run": "preview HTTP request without executing (includes curl)",
  "--validate": "validate response against OpenAPI schema",
  "--verbose": "show full HTTP request/response",
  "--max-items": "limit array results",
  "--filter-pii": "redact PII fields in response before output",
};

export function firstLine(text: string): string {
  return (text ?? "").split("\n")[0].trim();
}

/**
 * Docstrings arrive indented by their source's code block and padded with
 * trailing whitespace, which forces the YAML writer into escaped double-quoted
 * output — unreadable, and it inflates the very token count we are cutting.
 * Dedenting lets it emit a literal block instead.
 */
export function normalizeBlock(text: string): string {
  const lines = (text ?? "").replace(/\s+$/gm, "").split("\n");
  while (lines.length > 0 && lines[0] === "") lines.shift();
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  if (lines.length === 0) return "";

  // The opening line of a docstring carries no indentation, so measuring it
  // would always yield a strip of zero. Indentation is judged on the rest.
  const rest = lines.slice(1).filter((l) => l !== "");
  if (rest.length === 0) return lines.join("\n");

  const strip = Math.min(...rest.map((l) => l.match(/^ */)![0].length));
  return [lines[0], ...lines.slice(1).map((l) => l.slice(strip))].join("\n");
}

export function findGroup(groups: OperationGroup[], name: string): OperationGroup | undefined {
  const wanted = name.toLowerCase();
  return groups.find((g) => g.tag.toLowerCase() === wanted);
}

export function findOp(group: OperationGroup, name: string): Operation | undefined {
  const wanted = name.toLowerCase();
  return group.operations.find(
    (o) => simplifyName(o.id, group.tag).toLowerCase() === wanted || o.id.toLowerCase() === wanted
  );
}
