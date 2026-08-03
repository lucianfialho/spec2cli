import { describe, it, expect, vi, afterEach } from "vitest";
import { Command } from "commander";
import { buildDynamicCommands } from "./dynamic-commands.js";
import type { OpenAPISpec } from "../parser/types.js";
import type { RuntimeConfig } from "../executor/types.js";

const spec: OpenAPISpec = {
  openapi: "3.0.0",
  info: { title: "Videos", version: "1" },
  servers: [{ url: "https://api.test" }],
  tags: [{ name: "videos" }],
  paths: {
    "/videos": {
      post: {
        operationId: "createVideo",
        tags: ["videos"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  content: { type: "object" },
                  tags: { type: "array", items: { type: "string" } },
                },
                required: ["name"],
              },
            },
          },
        },
        responses: { "200": { description: "ok" } },
      },
    },
  },
};

const config: RuntimeConfig = {
  specPath: "spec.json",
  baseUrl: "https://api.test",
  auth: { type: "none", value: "" },
  output: "quiet",
  verbose: false,
  quiet: false,
  dryRun: false,
  validate: false,
  filterPii: false,
  piiSalt: "",
  piiFields: [],
};

/** Runs one command and returns the JSON body that reached fetch. */
async function bodySentBy(args: string[]): Promise<Record<string, unknown>> {
  let sent: Record<string, unknown> = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      sent = JSON.parse(init.body as string);
      return {
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        text: async () => "{}",
      } as unknown as Response;
    })
  );
  vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
  vi.spyOn(console, "log").mockImplementation(() => {});

  const program = new Command();
  buildDynamicCommands(program, [], config, spec);
  const { extractOperations } = await import("../parser/extractor.js");
  buildDynamicCommands(program, extractOperations(spec), config, spec);
  await program.parseAsync(["node", "spec2cli", ...args]);
  return sent;
}

afterEach(() => vi.restoreAllMocks());

describe("object and array params given as JSON strings", () => {
  it("parses an object param instead of sending the raw string", async () => {
    const body = await bodySentBy(["videos", "create", "--name", "Clip", "--content", '{"url":"x","len":3}']);
    expect(body.content).toEqual({ url: "x", len: 3 });
  });

  it("parses an array param", async () => {
    const body = await bodySentBy(["videos", "create", "--name", "Clip", "--tags", '["a","b"]']);
    expect(body.tags).toEqual(["a", "b"]);
  });

  it("falls back to the string when it is not valid JSON", async () => {
    const body = await bodySentBy(["videos", "create", "--name", "Clip", "--content", "not json"]);
    expect(body.content).toBe("not json");
  });

  it("leaves a plain string param alone", async () => {
    const body = await bodySentBy(["videos", "create", "--name", "Clip"]);
    expect(body.name).toBe("Clip");
  });
});
