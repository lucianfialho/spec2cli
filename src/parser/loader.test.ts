import { describe, it, expect, vi, beforeEach } from "vitest";
import { loadSpec } from "./loader.js";
import { readFile } from "node:fs/promises";
import path from "node:path";

const FIXTURE_DIR = path.resolve("test/fixtures");

describe("loadSpec", () => {
  describe("local files", () => {
    it("loads YAML spec from file path", async () => {
      const spec = await loadSpec(path.join(FIXTURE_DIR, "petstore.yaml"));
      expect(spec.openapi).toBe("3.0.3");
      expect(spec.info.title).toBe("Petstore");
      expect(spec.paths).toBeDefined();
      expect(Object.keys(spec.paths).length).toBeGreaterThan(0);
    });

    it("loads JSON spec from file path", async () => {
      // Create a JSON version of the spec
      const yamlSpec = await loadSpec(path.join(FIXTURE_DIR, "petstore.yaml"));
      const jsonPath = path.join(FIXTURE_DIR, "petstore.json");
      const { writeFile } = await import("node:fs/promises");
      await writeFile(jsonPath, JSON.stringify(yamlSpec, null, 2));

      const spec = await loadSpec(jsonPath);
      expect(spec.openapi).toBe("3.0.3");
      expect(spec.info.title).toBe("Petstore");

      // Cleanup
      const { unlink } = await import("node:fs/promises");
      await unlink(jsonPath);
    });

    it("throws for missing file", async () => {
      await expect(loadSpec("/nonexistent/spec.yaml")).rejects.toThrow("Spec file not found");
    });
  });

  describe("remote URLs", () => {
    let tmpDir: string;

    beforeEach(async () => {
      vi.restoreAllMocks();
      const { mkdtemp } = await import("node:fs/promises");
      const { tmpdir } = await import("node:os");
      const { join } = await import("node:path");
      tmpDir = await mkdtemp(join(tmpdir(), "spec2cli-loader-"));
      vi.stubEnv("XDG_CACHE_HOME", tmpDir);
    });

    afterEach(async () => {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
      const { rm } = await import("node:fs/promises");
      await rm(tmpDir, { recursive: true, force: true });
    });

    it("loads spec from URL", async () => {
      const yamlContent = await readFile(path.join(FIXTURE_DIR, "petstore.yaml"), "utf-8");

      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        text: () => Promise.resolve(yamlContent),
      }));

      const spec = await loadSpec("https://example.com/openapi.yaml");
      expect(spec.openapi).toBe("3.0.3");
      expect(spec.info.title).toBe("Petstore");
      expect(fetch).toHaveBeenCalledWith("https://example.com/openapi.yaml", { headers: {} });
    });

    it("throws for failed HTTP request", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
        headers: new Headers(),
      }));

      await expect(loadSpec("https://example.com/missing.yaml")).rejects.toThrow("Failed to fetch spec");
    });
  });

  describe("swagger 2.0 conversion", () => {
    it("converts Swagger 2.0 to OpenAPI 3.0 automatically", async () => {
      const spec = await loadSpec(path.join(FIXTURE_DIR, "petstore-swagger2.json"));
      expect(spec.openapi).toMatch(/^3\./);
      expect(spec.info.title).toBe("Petstore Swagger 2");
      expect(spec.paths).toBeDefined();
      expect(spec.paths["/pets"]).toBeDefined();
    });

    it("preserves operations after conversion", async () => {
      const spec = await loadSpec(path.join(FIXTURE_DIR, "petstore-swagger2.json"));
      expect(spec.paths["/pets"]?.get?.operationId).toBe("listPets");
      expect(spec.paths["/pets"]?.post?.operationId).toBe("createPet");
      expect(spec.paths["/pets/{petId}"]?.get?.operationId).toBe("getPet");
    });

    it("converts host+basePath to servers", async () => {
      const spec = await loadSpec(path.join(FIXTURE_DIR, "petstore-swagger2.json"));
      expect(spec.servers).toBeDefined();
      expect(spec.servers!.length).toBeGreaterThan(0);
      expect(spec.servers![0].url).toContain("petstore.example.com");
    });
  });

  describe("validation", () => {
    it("rejects spec with no paths", async () => {
      const { writeFile, unlink } = await import("node:fs/promises");
      const tmpPath = path.join(FIXTURE_DIR, "empty.yaml");
      await writeFile(tmpPath, 'openapi: "3.0.3"\ninfo:\n  title: Empty\n  version: "1.0"\npaths: {}\n');

      await expect(loadSpec(tmpPath)).rejects.toThrow("no paths defined");
      await unlink(tmpPath);
    });
  });
});
