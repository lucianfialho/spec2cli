import { readFile, writeFile, mkdir, stat, utimes } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { createHash } from "node:crypto";

/**
 * Remote specs are cached with whatever validators the server gave us, so an
 * expired entry can be revalidated instead of re-downloaded. On a large spec
 * that is the difference between a full transfer and an empty 304 — GitHub's
 * own is 12.9 MB and takes ~1.3 s, against ~50 ms to confirm it is unchanged.
 *
 * Freshness and validity are separate concerns here: within the TTL we skip the
 * network entirely, and past it we ask rather than assume.
 */
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

export interface CacheEntry {
  content: string;
  etag?: string;
  lastModified?: string;
  /** Within the TTL, so it can be served without contacting the server. */
  fresh: boolean;
}

export interface CacheValidators {
  etag?: string;
  lastModified?: string;
}

function getCacheDir(): string {
  const xdg = process.env["XDG_CACHE_HOME"];
  return join(xdg ?? join(homedir(), ".cache"), "spec2cli", "specs");
}

function getCachePath(url: string): string {
  const hash = createHash("sha256").update(url).digest("hex").slice(0, 16);
  return join(getCacheDir(), `${hash}.spec`);
}

function getMetaPath(url: string): string {
  return `${getCachePath(url)}.meta`;
}

/** The cached spec with its validators, or null if nothing is stored. */
export async function readCache(url: string): Promise<CacheEntry | null> {
  const path = getCachePath(url);

  let content: string;
  let age: number;
  try {
    const info = await stat(path);
    age = Date.now() - info.mtimeMs;
    content = await readFile(path, "utf-8");
  } catch {
    return null;
  }

  let validators: CacheValidators = {};
  try {
    validators = JSON.parse(await readFile(getMetaPath(url), "utf-8"));
  } catch {
    // Entries written before validators were stored, or a corrupt sidecar. The
    // content is still usable; it just cannot be revalidated cheaply.
  }

  return { content, ...validators, fresh: age <= CACHE_TTL };
}

export async function writeCache(
  url: string,
  content: string,
  validators: CacheValidators = {}
): Promise<void> {
  await mkdir(getCacheDir(), { recursive: true });
  await writeFile(getCachePath(url), content, "utf-8");

  const meta: CacheValidators = {};
  if (validators.etag) meta.etag = validators.etag;
  if (validators.lastModified) meta.lastModified = validators.lastModified;
  await writeFile(getMetaPath(url), JSON.stringify(meta), "utf-8");
}

/**
 * Marks an entry as freshly confirmed after a 304, so calls inside the next TTL
 * skip the network rather than revalidating all over again.
 */
export async function touchCache(url: string): Promise<void> {
  const now = new Date();
  await utimes(getCachePath(url), now, now);
}

/** Conditional request headers for an entry; empty if it has no validators. */
export function conditionalHeaders(entry: CacheEntry): Record<string, string> {
  const headers: Record<string, string> = {};
  if (entry.etag) headers["If-None-Match"] = entry.etag;
  if (entry.lastModified) headers["If-Modified-Since"] = entry.lastModified;
  return headers;
}
