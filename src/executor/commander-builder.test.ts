import { describe, it, expect } from "vitest";
import { Command } from "commander";
import { loadSpec } from "../parser/loader.js";
import { extractOperations } from "../parser/extractor.js";
import { buildCommands } from "./commander-builder.js";
import type { RuntimeConfig } from "./types.js";
import path from "node:path";

const FIXTURE = path.resolve("test/fixtures/petstore.yaml");

const config: RuntimeConfig = {
  specPath: FIXTURE,
  baseUrl: "https://petstore.example.com/v1",
  auth: { type: "none", value: "" },
  output: "json",
  verbose: false,
  quiet: false,
};

describe("buildCommands", () => {
  it("creates command groups matching spec tags", async () => {
    const spec = await loadSpec(FIXTURE);
    const groups = extractOperations(spec);
    const program = new Command();
    program.exitOverride();
    buildCommands(program, groups, config, spec);

    const commandNames = program.commands.map((c) => c.name());
    expect(commandNames).toContain("pets");
    expect(commandNames).toContain("store");
  });

  it("creates subcommands matching operations", async () => {
    const spec = await loadSpec(FIXTURE);
    const groups = extractOperations(spec);
    const program = new Command();
    program.exitOverride();
    buildCommands(program, groups, config, spec);

    const petsCmd = program.commands.find((c) => c.name() === "pets")!;
    const subNames = petsCmd.commands.map((c) => c.name());
    expect(subNames).toContain("list");
    expect(subNames).toContain("create");
    expect(subNames).toContain("get");
    expect(subNames).toContain("update");
    expect(subNames).toContain("delete");
  });

  it("creates subcommands for store group", async () => {
    const spec = await loadSpec(FIXTURE);
    const groups = extractOperations(spec);
    const program = new Command();
    program.exitOverride();
    buildCommands(program, groups, config, spec);

    const storeCmd = program.commands.find((c) => c.name() === "store")!;
    const subNames = storeCmd.commands.map((c) => c.name());
    expect(subNames).toContain("getinventory");
    expect(subNames).toContain("placeorder");
    expect(subNames).toContain("getorder");
  });

  it("adds options to commands from spec params", async () => {
    const spec = await loadSpec(FIXTURE);
    const groups = extractOperations(spec);
    const program = new Command();
    program.exitOverride();
    buildCommands(program, groups, config, spec);

    const petsCmd = program.commands.find((c) => c.name() === "pets")!;
    const listCmd = petsCmd.commands.find((c) => c.name() === "list")!;

    const optionNames = listCmd.options.map((o) => o.long);
    expect(optionNames).toContain("--limit");
    expect(optionNames).toContain("--status");
  });

  it("adds required options from spec", async () => {
    const spec = await loadSpec(FIXTURE);
    const groups = extractOperations(spec);
    const program = new Command();
    program.exitOverride();
    buildCommands(program, groups, config, spec);

    const petsCmd = program.commands.find((c) => c.name() === "pets")!;
    const createCmd = petsCmd.commands.find((c) => c.name() === "create")!;

    const nameOpt = createCmd.options.find((o) => o.long === "--name");
    expect(nameOpt).toBeDefined();
    expect(nameOpt!.required).toBe(true);
  });

  it("shows help for subcommands", async () => {
    const spec = await loadSpec(FIXTURE);
    const groups = extractOperations(spec);
    const program = new Command();
    program.exitOverride();
    program.configureOutput({ writeOut: () => {}, writeErr: () => {} });
    buildCommands(program, groups, config, spec);

    const petsCmd = program.commands.find((c) => c.name() === "pets")!;
    const listCmd = petsCmd.commands.find((c) => c.name() === "list")!;
    expect(listCmd.description()).toBe("List all pets");
  });
});
