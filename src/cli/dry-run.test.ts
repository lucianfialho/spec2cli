import { describe, it, expect, vi, afterEach } from "vitest";
import { printDryRun } from "./dry-run.js";
import type { Operation } from "../parser/types.js";
import type { RuntimeConfig } from "../executor/types.js";

const SECRET = "sk-supersecret-abcdef123456";

const op: Operation = {
  id: "createPet",
  method: "POST",
  path: "/pets/{petId}",
  summary: "Create a pet",
  description: "",
  params: [
    { name: "petId", in: "path", type: "string", required: true, description: "" },
    { name: "name", in: "body", type: "string", required: true, description: "" },
    { name: "X-Trace", in: "header", type: "string", required: false, description: "" },
  ],
  bodyRequired: true,
  security: [],
};

function config(overrides: Partial<RuntimeConfig> = {}): RuntimeConfig {
  return {
    specPath: "api.yaml",
    baseUrl: "https://api.example.com",
    auth: { type: "bearer", value: SECRET },
    output: "pretty",
    verbose: false,
    quiet: false,
    dryRun: true,
    validate: false,
    filterPii: false,
    piiSalt: "",
    piiFields: [],
    ...overrides,
  };
}

function run(cfg: RuntimeConfig) {
  const lines: string[] = [];
  const spy = vi.spyOn(console, "log").mockImplementation((m) => void lines.push(String(m)));
  printDryRun(op, { petId: "1", name: "Rex", "X-Trace": "abc" }, cfg);
  spy.mockRestore();
  return lines.join("\n");
}

afterEach(() => vi.restoreAllMocks());

describe("credential masking", () => {
  it("never prints the token in human output", () => {
    const out = run(config());
    expect(out).not.toContain(SECRET);
    expect(out).toContain("Bearer sk-s...3456");
  });

  it("masks it inside the curl line too, since that is the part people paste", () => {
    const curl = run(config()).split("curl -X")[1];
    expect(curl).not.toContain(SECRET);
  });

  it("says how to get the literal value back", () => {
    expect(run(config())).toContain("--reveal");
  });

  it("prints it literally only when --reveal is given", () => {
    const out = run(config({ revealSecrets: true }));
    expect(out).toContain(SECRET);
    expect(out).not.toContain("--reveal to emit");
  });

  it("masks an api key header under its own name", () => {
    const out = run(config({ auth: { type: "apiKey", value: SECRET, headerName: "X-API-Key" } }));
    expect(out).not.toContain(SECRET);
    expect(out).toContain("X-API-Key: sk-s...3456");
  });

  it("leaves non-credential headers alone", () => {
    expect(run(config())).toContain("Accept: application/json");
  });
});

describe("--output json", () => {
  it("emits a parseable request instead of prose", () => {
    const doc = JSON.parse(run(config({ output: "json" })));
    expect(doc).toMatchObject({ method: "POST", url: "https://api.example.com/pets/1" });
    expect(doc.body).toEqual({ name: "Rex" });
  });

  it("records whether secrets were masked", () => {
    expect(JSON.parse(run(config({ output: "json" }))).secrets_masked).toBe(true);
    expect(JSON.parse(run(config({ output: "json", revealSecrets: true }))).secrets_masked).toBe(false);
  });

  it("masks the token in the json payload as well", () => {
    expect(run(config({ output: "json" }))).not.toContain(SECRET);
  });
});

describe("request building", () => {
  it("includes header params from the spec, which it used to drop", () => {
    expect(JSON.parse(run(config({ output: "json" }))).headers["X-Trace"]).toBe("abc");
  });
});
