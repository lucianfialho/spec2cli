import type { OutputOptions, Envelope } from "./types.js";

const NO_COLOR = !!process.env["NO_COLOR"];

export function formatOutput(data: unknown, options: OutputOptions): string {
  switch (options.format) {
    case "quiet":
      return "";
    case "json":
      return JSON.stringify(data);
    case "pretty":
      return colorize(JSON.stringify(data, null, 2));
    case "table":
      return formatTable(data);
    case "envelope":
      return JSON.stringify(buildEnvelope(data, options.maxItems));
    default:
      return JSON.stringify(data, null, 2);
  }
}

export function buildEnvelope(data: unknown, maxItems?: number): Envelope {
  if (Array.isArray(data)) {
    const total = data.length;
    const truncated = maxItems !== undefined && total > maxItems;
    const sliced = truncated ? data.slice(0, maxItems) : data;

    return {
      summary: `Found ${total} items.${truncated ? ` Showing first ${maxItems}.` : ""}`,
      data: sliced,
      _meta: {
        count: sliced.length,
        total,
        truncated,
      },
    };
  }

  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    const summary = generateObjectSummary(obj);
    return {
      summary,
      data: obj,
      _meta: { truncated: false },
    };
  }

  return {
    summary: String(data),
    data,
    _meta: { truncated: false },
  };
}

function generateObjectSummary(obj: Record<string, unknown>): string {
  // Try to build a meaningful summary from common fields
  const parts: string[] = [];

  if (obj["id"] !== undefined) parts.push(`#${obj["id"]}`);
  if (typeof obj["name"] === "string") parts.push(obj["name"]);
  if (typeof obj["title"] === "string") parts.push(obj["title"]);
  if (typeof obj["status"] === "string") parts.push(`(${obj["status"]})`);
  if (typeof obj["state"] === "string") parts.push(`(${obj["state"]})`);

  if (parts.length > 0) return `Resource ${parts.join(" ")}`;
  return `Object with ${Object.keys(obj).length} fields.`;
}

function formatTable(data: unknown): string {
  if (!Array.isArray(data) || data.length === 0) {
    return Array.isArray(data) ? "(empty)" : JSON.stringify(data, null, 2);
  }

  const items = data as Record<string, unknown>[];
  const keys = Object.keys(items[0]);

  // Calculate column widths
  const widths = new Map<string, number>();
  for (const key of keys) {
    widths.set(key, key.length);
  }
  for (const item of items) {
    for (const key of keys) {
      const len = String(item[key] ?? "").length;
      widths.set(key, Math.max(widths.get(key)!, len));
    }
  }

  // Build rows
  const header = keys.map((k) => k.padEnd(widths.get(k)!)).join("  ");
  const separator = keys.map((k) => "─".repeat(widths.get(k)!)).join("──");
  const rows = items.map((item) =>
    keys.map((k) => String(item[k] ?? "").padEnd(widths.get(k)!)).join("  ")
  );

  return [header, separator, ...rows].join("\n");
}

function colorize(json: string): string {
  if (NO_COLOR) return json;

  return json
    .replace(/"([^"]+)":/g, `\x1b[36m"$1"\x1b[0m:`) // keys in cyan
    .replace(/: "([^"]*)"/g, `: \x1b[32m"$1"\x1b[0m`) // string values in green
    .replace(/: (\d+)/g, `: \x1b[33m$1\x1b[0m`) // numbers in yellow
    .replace(/: (true|false)/g, `: \x1b[35m$1\x1b[0m`) // booleans in magenta
    .replace(/: (null)/g, `: \x1b[90m$1\x1b[0m`); // null in gray
}
