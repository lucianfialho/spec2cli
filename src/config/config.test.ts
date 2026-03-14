import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadConfig, resolveConfig } from "./rc.js";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("loadConfig", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "tocli-rc-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("loads .toclirc from directory", async () => {
    await writeFile(join(tmpDir, ".toclirc"), "spec: ./api.yaml\nbaseUrl: https://api.example.com\n");
    const config = await loadConfig(tmpDir);
    expect(config).not.toBeNull();
    expect(config!.spec).toBe("./api.yaml");
    expect(config!.baseUrl).toBe("https://api.example.com");
  });

  it("returns null when no .toclirc found", async () => {
    const config = await loadConfig(tmpDir);
    expect(config).toBeNull();
  });

  it("loads config with environments", async () => {
    const yaml = `
spec: ./api.yaml
baseUrl: https://api.example.com
auth:
  type: bearer
  envVar: API_TOKEN
environments:
  staging:
    baseUrl: https://staging.example.com
    auth:
      envVar: STAGING_TOKEN
`;
    await writeFile(join(tmpDir, ".toclirc"), yaml);
    const config = await loadConfig(tmpDir);
    expect(config!.environments!["staging"].baseUrl).toBe("https://staging.example.com");
  });
});

describe("resolveConfig", () => {
  it("returns base config when no env specified", () => {
    const config = {
      spec: "./api.yaml",
      baseUrl: "https://prod.example.com",
      auth: { type: "bearer", envVar: "PROD_TOKEN" },
    };
    const resolved = resolveConfig(config);
    expect(resolved.spec).toBe("./api.yaml");
    expect(resolved.baseUrl).toBe("https://prod.example.com");
    expect(resolved.authEnvVar).toBe("PROD_TOKEN");
  });

  it("overrides with environment config", () => {
    const config = {
      spec: "./api.yaml",
      baseUrl: "https://prod.example.com",
      auth: { type: "bearer", envVar: "PROD_TOKEN" },
      environments: {
        staging: {
          baseUrl: "https://staging.example.com",
          auth: { envVar: "STAGING_TOKEN" },
        },
      },
    };
    const resolved = resolveConfig(config, "staging");
    expect(resolved.baseUrl).toBe("https://staging.example.com");
    expect(resolved.authEnvVar).toBe("STAGING_TOKEN");
  });

  it("keeps base config for unknown env", () => {
    const config = {
      spec: "./api.yaml",
      baseUrl: "https://prod.example.com",
    };
    const resolved = resolveConfig(config, "nonexistent");
    expect(resolved.baseUrl).toBe("https://prod.example.com");
  });
});
