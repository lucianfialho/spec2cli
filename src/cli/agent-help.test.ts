import { describe, it, expect, afterEach, vi } from "vitest";
import { parseAgentHelpSelector } from "./agent-help.js";
import { help } from "./agent-help.test-helper.js";

afterEach(() => vi.restoreAllMocks());

describe("parseAgentHelpSelector", () => {
  it("reads no target from a bare invocation", () => {
    expect(parseAgentHelpSelector(["--spec", "api.yaml", "--agent-help"])).toEqual({});
  });

  it("reads a group", () => {
    const s = parseAgentHelpSelector(["--spec", "api.yaml", "--agent-help", "pets"]);
    expect(s.group).toBe("pets");
    expect(s.command).toBeUndefined();
  });

  it("reads a group and command", () => {
    const s = parseAgentHelpSelector(["--agent-help", "pets", "list"]);
    expect(s).toMatchObject({ group: "pets", command: "list" });
  });

  it("does not mistake a value-flag's value for a positional", () => {
    const s = parseAgentHelpSelector([
      "--agent-help", "--spec", "pets.yaml", "--output", "json", "store",
    ]);
    expect(s.group).toBe("store");
  });

  it("reads --find with its query", () => {
    const s = parseAgentHelpSelector(["--agent-help", "--find", "create pet"]);
    expect(s.find).toBe("create pet");
    expect(s.group).toBeUndefined();
  });

  it("reads --all", () => {
    expect(parseAgentHelpSelector(["--agent-help", "--all"]).all).toBe(true);
  });
});

describe("root level", () => {
  it("lists groups with command counts instead of the commands themselves", async () => {
    const { doc } = await help();
    expect(doc.groups).toEqual({ pets: "5 commands", store: "3 commands" });
    expect(doc.commands).toBeUndefined();
  });

  it("tells the agent how to drill down", async () => {
    const { doc } = await help();
    expect(Object.values(doc.drill_down).join(" ")).toContain("--agent-help <group>");
  });

  it("costs less than the full dump", async () => {
    const root = await help();
    const all = await help({ all: true });
    expect(root.raw.length).toBeLessThan(all.raw.length / 2);
  });
});

describe("group level", () => {
  it("lists command names without parameters", async () => {
    const { doc } = await help({ group: "pets" });
    expect(Object.keys(doc.commands)).toContain("list");
    expect(doc.required).toBeUndefined();
    expect(doc.optional).toBeUndefined();
  });

  it("matches the group case-insensitively", async () => {
    const { doc } = await help({ group: "PETS" });
    expect(doc.group).toBe("pets");
  });

  it("reports the known groups when the group is unknown", async () => {
    const { doc } = await help({ group: "nope" });
    expect(doc.error).toContain("nope");
    expect(doc.groups).toEqual(["pets", "store"]);
  });
});
