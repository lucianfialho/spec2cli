import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import type { OpenAPISpec } from "./types.js";

export async function loadSpec(source: string): Promise<OpenAPISpec> {
  const raw = await fetchSource(source);
  const spec = parseContent(raw, source);
  validate(spec);
  return spec;
}

async function fetchSource(source: string): Promise<string> {
  if (source.startsWith("http://") || source.startsWith("https://")) {
    const res = await fetch(source);
    if (!res.ok) {
      throw new Error(`Failed to fetch spec from ${source}: ${res.status} ${res.statusText}`);
    }
    return res.text();
  }

  try {
    return await readFile(source, "utf-8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new Error(`Spec file not found: ${source}`);
    }
    throw new Error(`Failed to read spec file: ${source} (${code})`);
  }
}

function parseContent(raw: string, source: string): OpenAPISpec {
  const trimmed = raw.trimStart();

  // JSON starts with { or [
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.parse(raw);
    } catch {
      throw new Error(`Invalid JSON in spec: ${source}`);
    }
  }

  // Try YAML
  try {
    return parseYaml(raw) as OpenAPISpec;
  } catch {
    throw new Error(`Invalid YAML in spec: ${source}`);
  }
}

function validate(spec: OpenAPISpec): void {
  if (!spec.openapi || !spec.openapi.startsWith("3.")) {
    throw new Error(
      `Unsupported OpenAPI version: ${spec.openapi ?? "missing"}. mcp-c requires OpenAPI 3.x.`
    );
  }

  if (!spec.info) {
    throw new Error("Invalid spec: missing 'info' field.");
  }

  if (!spec.paths || Object.keys(spec.paths).length === 0) {
    throw new Error("Invalid spec: no paths defined.");
  }
}
