import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readCache, writeCache, touchCache, conditionalHeaders } from "./cache.js";
import { mkdtemp, rm, utimes, stat, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const URL_A = "https://example.com/openapi.json";

/** Backdates the cached entry so it reads as past its TTL. */
async function ageEntry(cacheDir: string, ms: number) {
  const dir = join(cacheDir, "spec2cli", "specs");
  for (const name of await readdir(dir)) {
    if (!name.endsWith(".spec")) continue;
    const path = join(dir, name);
    const when = new Date((await stat(path)).mtimeMs - ms);
    await utimes(path, when, when);
  }
}

describe("spec cache", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "spec2cli-cache-"));
    vi.stubEnv("XDG_CACHE_HOME", tmpDir);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("returns null for an uncached URL", async () => {
    expect(await readCache(URL_A)).toBeNull();
  });

  it("round-trips content", async () => {
    const content = '{"openapi":"3.0.3","info":{"title":"Test"}}';
    await writeCache(URL_A, content);
    expect((await readCache(URL_A))?.content).toBe(content);
  });

  it("keeps different URLs apart", async () => {
    await writeCache("https://a.com/spec.json", "spec-a");
    await writeCache("https://b.com/spec.json", "spec-b");

    expect((await readCache("https://a.com/spec.json"))?.content).toBe("spec-a");
    expect((await readCache("https://b.com/spec.json"))?.content).toBe("spec-b");
  });

  it("stores the validators the server supplied", async () => {
    await writeCache(URL_A, "spec", { etag: '"abc123"', lastModified: "Fri, 31 Jul 2026 17:06:10 GMT" });
    const entry = await readCache(URL_A);

    expect(entry?.etag).toBe('"abc123"');
    expect(entry?.lastModified).toBe("Fri, 31 Jul 2026 17:06:10 GMT");
  });

  it("reads an entry stored without validators", async () => {
    await writeCache(URL_A, "spec");
    const entry = await readCache(URL_A);

    expect(entry?.content).toBe("spec");
    expect(entry?.etag).toBeUndefined();
  });

  describe("freshness", () => {
    it("marks a just-written entry fresh", async () => {
      await writeCache(URL_A, "spec");
      expect((await readCache(URL_A))?.fresh).toBe(true);
    });

    it("marks an entry past the TTL stale, without discarding it", async () => {
      await writeCache(URL_A, "spec", { etag: '"abc"' });
      await ageEntry(tmpDir, 2 * 60 * 60 * 1000);

      const entry = await readCache(URL_A);
      expect(entry?.fresh).toBe(false);
      expect(entry?.content).toBe("spec");
      expect(entry?.etag).toBe('"abc"');
    });

    it("becomes fresh again once touched", async () => {
      await writeCache(URL_A, "spec");
      await ageEntry(tmpDir, 2 * 60 * 60 * 1000);
      expect((await readCache(URL_A))?.fresh).toBe(false);

      await touchCache(URL_A);
      expect((await readCache(URL_A))?.fresh).toBe(true);
    });

    it("preserves content through a touch", async () => {
      await writeCache(URL_A, "spec-body", { etag: '"abc"' });
      await touchCache(URL_A);

      const entry = await readCache(URL_A);
      expect(entry?.content).toBe("spec-body");
      expect(entry?.etag).toBe('"abc"');
    });
  });
});

describe("conditionalHeaders", () => {
  it("sends the etag when there is one", () => {
    expect(conditionalHeaders({ content: "x", fresh: false, etag: '"abc"' })).toEqual({
      "If-None-Match": '"abc"',
    });
  });

  it("falls back to the modification date", () => {
    const headers = conditionalHeaders({ content: "x", fresh: false, lastModified: "Fri, 31 Jul 2026 17:06:10 GMT" });
    expect(headers).toEqual({ "If-Modified-Since": "Fri, 31 Jul 2026 17:06:10 GMT" });
  });

  it("is empty when the server gave us nothing to validate against", () => {
    expect(conditionalHeaders({ content: "x", fresh: false })).toEqual({});
  });
});
