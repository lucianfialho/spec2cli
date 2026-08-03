import { readFile, mkdtemp, rm, utimes, stat, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import path from "node:path";

export const SPEC_URL = "https://example.com/openapi.yaml";
export const TWO_HOURS = 2 * 60 * 60 * 1000;

const FIXTURE_DIR = path.resolve("test/fixtures");

/** A fetch Response stand-in carrying the headers a real one always has. */
export function response(init: { status?: number; body?: string; headers?: Record<string, string> }) {
  const status = init.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    headers: new Headers(init.headers ?? {}),
    text: () => Promise.resolve(init.body ?? ""),
  };
}

export function petstoreYaml(): Promise<string> {
  return readFile(path.join(FIXTURE_DIR, "petstore.yaml"), "utf-8");
}

export function makeCacheDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "spec2cli-loader-"));
}

export function removeCacheDir(dir: string): Promise<void> {
  return rm(dir, { recursive: true, force: true });
}

/** Backdates cached entries so they read as past their TTL. */
export async function ageCache(cacheDir: string, ms: number): Promise<void> {
  const dir = join(cacheDir, "spec2cli", "specs");
  for (const name of await readdir(dir)) {
    if (!name.endsWith(".spec")) continue;
    const p = join(dir, name);
    const when = new Date((await stat(p)).mtimeMs - ms);
    await utimes(p, when, when);
  }
}
