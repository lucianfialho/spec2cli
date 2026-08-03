import { describe, it, expect, afterEach, vi } from "vitest";
import { printAgentHelp } from "./agent-help.js";
import { help, fixture, capture } from "./agent-help.test-helper.js";

afterEach(() => vi.restoreAllMocks());

describe("command level", () => {
  it("expands parameters for the selected command only", async () => {
    const { doc } = await help({ group: "pets", command: "get" });
    expect(doc.command).toBe("get");
    expect(doc.method).toBe("GET");
    expect(doc.required.map((p: any) => p.name)).toContain("petId");
  });

  it("includes a runnable example", async () => {
    const { doc } = await help({ group: "pets", command: "get" });
    expect(doc.example).toContain("pets get");
    expect(doc.example).toContain("--petId");
  });

  it("reports the known commands when the command is unknown", async () => {
    const { doc } = await help({ group: "pets", command: "nope" });
    expect(doc.error).toContain("nope");
    expect(doc.commands).toContain("list");
  });

  it("keeps the full description rather than its first line", async () => {
    const { spec, groups } = await fixture();
    const pets = groups.find((g) => g.tag === "pets")!;
    const list = pets.operations.find((o) => o.id === "listPets")!;
    list.description = "Line one.\n    Args:\n        status: one of available, sold";

    const { doc } = capture(() => printAgentHelp(groups, spec, { group: "pets", command: "list" }));

    expect(doc.desc).toContain("available, sold");
    // Dedented against the body, so the block stays readable YAML.
    expect(doc.desc).toContain("Args:");
    expect(doc.desc).not.toContain("    Args:");
  });
});

describe("search", () => {
  it("finds commands across groups", async () => {
    const { doc } = await help({ find: "pet" });
    expect(Object.keys(doc.matches).length).toBeGreaterThan(0);
  });

  it("requires every term to match", async () => {
    const { doc } = await help({ find: "pet zzzznomatch" });
    expect(doc.matches).toBe("no matches");
  });

  it("qualifies each match with its group", async () => {
    const { doc } = await help({ find: "pet" });
    expect(Object.keys(doc.matches).every((k) => k.includes(" "))).toBe(true);
  });
});

describe("--all", () => {
  it("still emits every command with parameters", async () => {
    const { doc } = await help({ all: true });
    expect(Object.keys(doc.commands)).toEqual(["pets", "store"]);
    expect(doc.commands.pets.get.required.map((p: any) => p.name)).toContain("petId");
  });
});
