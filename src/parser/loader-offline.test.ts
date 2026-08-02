import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { loadSpec } from "./loader.js";
import { writeCache } from "./cache.js";
import {
  SPEC_URL,
  TWO_HOURS,
  response,
  petstoreYaml,
  makeCacheDir,
  removeCacheDir,
  ageCache,
} from "./loader-cache.test-helper.js";

describe("when the spec server cannot be reached", () => {
  let tmpDir: string;
  let spec: string;

  beforeEach(async () => {
    vi.restoreAllMocks();
    tmpDir = await makeCacheDir();
    vi.stubEnv("XDG_CACHE_HOME", tmpDir);
    spec = await petstoreYaml();
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    await removeCacheDir(tmpDir);
  });

  it("falls back to the cached spec rather than failing the command", async () => {
    await writeCache(SPEC_URL, spec, { etag: '"v1"' });
    await ageCache(tmpDir, TWO_HOURS);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("fetch failed")));
    const warn = vi.spyOn(console, "error").mockImplementation(() => {});

    expect((await loadSpec(SPEC_URL)).info.title).toBe("Petstore");
    expect(warn.mock.calls.join(" ")).toContain("using cached spec");
  });

  it("still fails when there is no cached copy to fall back to", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("fetch failed")));
    await expect(loadSpec(SPEC_URL)).rejects.toThrow("Failed to fetch spec");
  });

  it("falls back on an error status too", async () => {
    await writeCache(SPEC_URL, spec, { etag: '"v1"' });
    await ageCache(tmpDir, TWO_HOURS);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ status: 500 })));
    const warn = vi.spyOn(console, "error").mockImplementation(() => {});

    expect((await loadSpec(SPEC_URL)).info.title).toBe("Petstore");
    expect(warn.mock.calls.join(" ")).toContain("500");
  });

  it("reports the failure when an error status has no cached copy behind it", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ status: 404 })));
    await expect(loadSpec(SPEC_URL)).rejects.toThrow("Failed to fetch spec");
  });
});
