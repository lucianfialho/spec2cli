import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { loadSpec } from "./loader.js";
import {
  SPEC_URL,
  TWO_HOURS,
  response,
  petstoreYaml,
  makeCacheDir,
  removeCacheDir,
  ageCache,
} from "./loader-cache.test-helper.js";

describe("remote spec revalidation", () => {
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

  it("sends the stored validators when the entry has expired", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response({
        body: spec,
        headers: { etag: '"v1"', "last-modified": "Fri, 31 Jul 2026 17:06:10 GMT" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await loadSpec(SPEC_URL);
    await ageCache(tmpDir, TWO_HOURS);
    await loadSpec(SPEC_URL);

    expect(fetchMock.mock.calls[1][1].headers).toMatchObject({
      "If-None-Match": '"v1"',
      "If-Modified-Since": "Fri, 31 Jul 2026 17:06:10 GMT",
    });
  });

  it("skips the network entirely while the entry is fresh", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ body: spec, headers: { etag: '"v1"' } }));
    vi.stubGlobal("fetch", fetchMock);

    await loadSpec(SPEC_URL);
    await loadSpec(SPEC_URL);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("serves the cached body on 304 instead of re-downloading", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ body: spec, headers: { etag: '"v1"' } }))
      .mockResolvedValueOnce(response({ status: 304 }));
    vi.stubGlobal("fetch", fetchMock);

    await loadSpec(SPEC_URL);
    await ageCache(tmpDir, TWO_HOURS);

    expect((await loadSpec(SPEC_URL)).info.title).toBe("Petstore");
  });

  it("counts a 304 as confirmation, so the next call needs no network", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ body: spec, headers: { etag: '"v1"' } }))
      .mockResolvedValueOnce(response({ status: 304 }));
    vi.stubGlobal("fetch", fetchMock);

    await loadSpec(SPEC_URL);
    await ageCache(tmpDir, TWO_HOURS);
    await loadSpec(SPEC_URL);
    await loadSpec(SPEC_URL);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("takes the new body when the spec actually changed", async () => {
    const changed = spec.replace("title: Petstore", "title: Petstore v2");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ body: spec, headers: { etag: '"v1"' } }))
      .mockResolvedValueOnce(response({ body: changed, headers: { etag: '"v2"' } }));
    vi.stubGlobal("fetch", fetchMock);

    await loadSpec(SPEC_URL);
    await ageCache(tmpDir, TWO_HOURS);

    expect((await loadSpec(SPEC_URL)).info.title).toBe("Petstore v2");
  });

  it("revalidates a fresh entry when refresh is requested", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ body: spec, headers: { etag: '"v1"' } }))
      .mockResolvedValueOnce(response({ status: 304 }));
    vi.stubGlobal("fetch", fetchMock);

    await loadSpec(SPEC_URL);
    await loadSpec(SPEC_URL, { refresh: true });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
