import { describe, it, expect } from "vitest";
import { Command } from "commander";
import { buildDynamicCommands } from "./dynamic-commands.js";
import { extractOperations } from "../parser/extractor.js";
import type { OpenAPISpec } from "../parser/types.js";
import type { RuntimeConfig } from "../executor/types.js";

const config: RuntimeConfig = {
  specPath: "spec.json",
  baseUrl: "http://localhost:9999",
  auth: { type: "none", value: "" },
  output: "json",
  verbose: false,
  quiet: false,
  dryRun: true,
  validate: false,
  filterPii: false,
  piiSalt: "",
  piiFields: [],
};

function build(spec: OpenAPISpec): Command {
  const program = new Command();
  buildDynamicCommands(program, extractOperations(spec), config, spec);
  return program;
}

function commandNames(program: Command, group: string): string[] {
  const groupCmd = program.commands.find((c) => c.name() === group)!;
  return groupCmd.commands.map((c) => c.name());
}

describe("building commands from awkward specs", () => {
  it("survives two operations that simplify to the same name", () => {
    // Commander throws while the tree is being built, so a collision does not
    // degrade one command — it takes down the whole CLI, --help included.
    const spec: OpenAPISpec = {
      openapi: "3.0.0",
      info: { title: "Edge", version: "1" },
      tags: [{ name: "items" }],
      paths: {
        "/items/search": { get: { operationId: "searchItems", tags: ["items"] } },
        "/items/lookup": { post: { operationId: "searchItem", tags: ["items"] } },
      },
    };

    expect(() => build(spec)).not.toThrow();
    expect(commandNames(build(spec), "items")).toEqual(["search-get", "search-post"]);
  });

  it("survives three operations colliding on one name", () => {
    const spec: OpenAPISpec = {
      openapi: "3.0.0",
      info: { title: "Edge", version: "1" },
      tags: [{ name: "items" }],
      paths: {
        "/a": { get: { operationId: "syncItems", tags: ["items"] } },
        "/b": { get: { operationId: "syncItem", tags: ["items"] } },
        "/c": { post: { operationId: "sync", tags: ["items"] } },
      },
    };

    const names = commandNames(build(spec), "items");
    expect(new Set(names).size).toBe(names.length);
  });

  it("turns a parameter name that is not a valid flag into one", () => {
    const spec: OpenAPISpec = {
      openapi: "3.0.0",
      info: { title: "Edge", version: "1" },
      tags: [{ name: "items" }],
      paths: {
        "/items": {
          get: {
            operationId: "listItems",
            tags: ["items"],
            parameters: [{ name: "filter[name]", in: "query", schema: { type: "string" } }],
          },
        },
      },
    };

    const program = build(spec);
    const list = program.commands.find((c) => c.name() === "items")!.commands[0];
    expect(list.options.map((o) => o.long)).toContain("--filter-name");
  });
});
