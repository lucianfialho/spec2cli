import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import { readCache, writeCache, touchCache, conditionalHeaders } from "./cache.js";
import type { OpenAPISpec } from "./types.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySpec = any;

export interface LoadOptions {
  /** Ignore cache freshness and revalidate (or refetch) the spec. */
  refresh?: boolean;
}

export async function loadSpec(source: string, options: LoadOptions = {}): Promise<OpenAPISpec> {
  const raw = await fetchSource(source, options);
  const parsed = parseContent(raw, source) as AnySpec;

  // Swagger 2.0 → convert to OpenAPI 3.0
  if (parsed.swagger && String(parsed.swagger).startsWith("2.")) {
    const converted = await convertSwagger2(parsed);
    validate(converted);
    return converted;
  }

  const spec = parsed as OpenAPISpec;
  validate(spec);
  return spec;
}

async function fetchSource(source: string, options: LoadOptions): Promise<string> {
  if (source.startsWith("http://") || source.startsWith("https://")) {
    return fetchRemote(source, options);
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

async function fetchRemote(source: string, options: LoadOptions): Promise<string> {
  const cached = await readCache(source);

  if (cached?.fresh && !options.refresh) return cached.content;

  // A stale entry is a question, not a miss: ask the server whether it changed.
  const headers = cached ? conditionalHeaders(cached) : {};

  let res: Response;
  try {
    res = await fetch(source, { headers });
  } catch (err) {
    // Nothing beats a copy of the spec when the network is gone. Say so, and
    // let the command run rather than failing on a spec we already have.
    if (cached) {
      console.error(`Warning: could not reach ${source}, using cached spec`);
      return cached.content;
    }
    throw new Error(`Failed to fetch spec from ${source}: ${(err as Error).message}`);
  }

  if (res.status === 304 && cached) {
    await touchCache(source).catch(() => {});
    return cached.content;
  }

  if (!res.ok) {
    if (cached) {
      console.error(`Warning: ${source} returned ${res.status}, using cached spec`);
      return cached.content;
    }
    throw new Error(`Failed to fetch spec from ${source}: ${res.status} ${res.statusText}`);
  }

  const content = await res.text();
  await writeCache(source, content, {
    etag: res.headers.get("etag") ?? undefined,
    lastModified: res.headers.get("last-modified") ?? undefined,
  }).catch(() => {}); // a cache write failure should not fail the command

  return content;
}

function parseContent(raw: string, source: string): unknown {
  const trimmed = raw.trimStart();

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.parse(raw);
    } catch {
      throw new Error(`Invalid JSON in spec: ${source}`);
    }
  }

  try {
    return parseYaml(raw);
  } catch {
    throw new Error(`Invalid YAML in spec: ${source}`);
  }
}

async function convertSwagger2(spec: AnySpec): Promise<OpenAPISpec> {
  // @ts-expect-error — swagger2openapi has no type declarations
  const { convertObj } = await import("swagger2openapi");

  return new Promise((resolve, reject) => {
    convertObj(spec, { patch: true, warnOnly: true }, (err: unknown, result: AnySpec) => {
      if (err) {
        reject(new Error(`Failed to convert Swagger 2.0 spec: ${(err as Error).message}`));
        return;
      }
      resolve(result.openapi as OpenAPISpec);
    });
  });
}

function validate(spec: OpenAPISpec): void {
  if (!spec.openapi || !spec.openapi.startsWith("3.")) {
    const version = spec.openapi ?? (spec as AnySpec).swagger ?? "missing";
    throw new Error(
      `Unsupported spec version: ${version}. spec2cli supports OpenAPI 3.x and Swagger 2.0.`
    );
  }

  if (!spec.info) {
    throw new Error("Invalid spec: missing 'info' field.");
  }

  if (!spec.paths || Object.keys(spec.paths).length === 0) {
    throw new Error("Invalid spec: no paths defined.");
  }
}
