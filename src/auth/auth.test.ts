import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resolveAuth } from "./flags.js";
import { saveProfile, loadAuthStore, removeProfile, maskToken } from "./config.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { OpenAPISpec } from "../parser/types.js";

const minimalSpec: OpenAPISpec = {
  openapi: "3.0.3",
  info: { title: "Test", version: "1.0" },
  paths: { "/test": { get: { summary: "test" } } },
};

const specWithBearer: OpenAPISpec = {
  ...minimalSpec,
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer" },
    },
  },
};

const specWithApiKey: OpenAPISpec = {
  ...minimalSpec,
  components: {
    securitySchemes: {
      apiKey: { type: "apiKey", in: "header", name: "X-Custom-Key" },
    },
  },
};

describe("resolveAuth", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "tocli-auth-resolve-"));
    vi.stubEnv("XDG_CONFIG_HOME", tmpDir);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("returns none when no auth provided", async () => {
    const auth = await resolveAuth({}, minimalSpec, {});
    expect(auth.type).toBe("none");
  });

  it("--token sets bearer auth", async () => {
    const auth = await resolveAuth({ token: "sk-123" }, minimalSpec, {});
    expect(auth.type).toBe("bearer");
    expect(auth.value).toBe("sk-123");
  });

  it("--api-key sets apiKey auth", async () => {
    const auth = await resolveAuth({ apiKey: "my-key" }, minimalSpec, {});
    expect(auth.type).toBe("apiKey");
    expect(auth.value).toBe("my-key");
  });

  it("detects api key header from spec", async () => {
    const auth = await resolveAuth({ apiKey: "my-key" }, specWithApiKey, {});
    expect(auth.headerName).toBe("X-Custom-Key");
  });

  it("resolves environment variables in token", async () => {
    const auth = await resolveAuth({ token: "$MY_TOKEN" }, minimalSpec, { MY_TOKEN: "resolved-123" });
    expect(auth.value).toBe("resolved-123");
  });

  it("resolves ${VAR} syntax", async () => {
    const auth = await resolveAuth({ token: "${API_KEY}" }, minimalSpec, { API_KEY: "secret" });
    expect(auth.value).toBe("secret");
  });

  it("picks up API_TOKEN from env when spec has auth", async () => {
    const auth = await resolveAuth({}, specWithBearer, { API_TOKEN: "env-token" });
    expect(auth.type).toBe("bearer");
    expect(auth.value).toBe("env-token");
  });

  it("uses .toclirc auth token", async () => {
    const auth = await resolveAuth({ rcAuthType: "bearer", rcAuthToken: "rc-token-123" }, minimalSpec, {});
    expect(auth.type).toBe("bearer");
    expect(auth.value).toBe("rc-token-123");
  });

  it("uses .toclirc auth envVar", async () => {
    const auth = await resolveAuth({ rcAuthType: "bearer", rcAuthEnvVar: "MY_API_TOKEN" }, minimalSpec, { MY_API_TOKEN: "env-resolved" });
    expect(auth.type).toBe("bearer");
    expect(auth.value).toBe("env-resolved");
  });

  it("defaults rcAuthType to bearer when not specified", async () => {
    const auth = await resolveAuth({ rcAuthToken: "tok" }, minimalSpec, {});
    expect(auth.type).toBe("bearer");
    expect(auth.value).toBe("tok");
  });

  it("inline --token takes priority over .toclirc auth", async () => {
    const auth = await resolveAuth({ token: "inline-tok", rcAuthToken: "rc-tok" }, minimalSpec, {});
    expect(auth.value).toBe("inline-tok");
  });

  it(".toclirc auth takes priority over saved profile", async () => {
    await saveProfile("default", { type: "bearer", value: "profile-tok" });
    const auth = await resolveAuth({ rcAuthToken: "rc-tok" }, minimalSpec);
    expect(auth.value).toBe("rc-tok");
  });

  it("resolves env vars in .toclirc auth token", async () => {
    const auth = await resolveAuth({ rcAuthToken: "$SECRET_TOK" }, minimalSpec, { SECRET_TOK: "resolved-secret" });
    expect(auth.value).toBe("resolved-secret");
  });
});

describe("auth config (profile persistence)", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "tocli-test-"));
    vi.stubEnv("XDG_CONFIG_HOME", tmpDir);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("saves and loads a profile", async () => {
    await saveProfile("default", { type: "bearer", value: "sk-test" });
    const store = await loadAuthStore();
    expect(store.profiles["default"]).toEqual({ type: "bearer", value: "sk-test" });
  });

  it("saves multiple profiles", async () => {
    await saveProfile("default", { type: "bearer", value: "sk-prod" });
    await saveProfile("staging", { type: "apiKey", value: "key-staging", headerName: "X-Key" });

    const store = await loadAuthStore();
    expect(Object.keys(store.profiles)).toEqual(["default", "staging"]);
  });

  it("removes a profile", async () => {
    await saveProfile("default", { type: "bearer", value: "sk-test" });
    const removed = await removeProfile("default");
    expect(removed).toBe(true);

    const store = await loadAuthStore();
    expect(store.profiles["default"]).toBeUndefined();
  });

  it("returns false removing nonexistent profile", async () => {
    const removed = await removeProfile("nope");
    expect(removed).toBe(false);
  });
});

describe("maskToken", () => {
  it("masks long tokens", () => {
    expect(maskToken("sk-1234567890abcdef")).toBe("sk-1...cdef");
  });

  it("masks short tokens", () => {
    expect(maskToken("short")).toBe("****");
  });
});
