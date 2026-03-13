import { describe, it, expect } from "vitest";
import { loadSpec } from "../parser/loader.js";
import { extractOperations } from "../parser/extractor.js";
import { generateManifest } from "./manifest.js";
import { generateGroupDetail } from "./group.js";
import { generateCommandSchema } from "./command.js";
import path from "node:path";

const FIXTURE = path.resolve("test/fixtures/petstore.yaml");

describe("Phase 1: Manifest", () => {
  it("generates manifest with all groups", async () => {
    const spec = await loadSpec(FIXTURE);
    const groups = extractOperations(spec);
    const manifest = generateManifest(groups, spec.info);

    expect(manifest.name).toBe("petstore");
    expect(manifest.version).toBe("1.0.0");
    expect(manifest._meta.protocol).toBe("mcp-c/1");
    expect(manifest.groups).toHaveLength(2);
    expect(manifest._meta.total_commands).toBe(8);
  });

  it("groups have name, description, command count", async () => {
    const spec = await loadSpec(FIXTURE);
    const groups = extractOperations(spec);
    const manifest = generateManifest(groups, spec.info);

    const pets = manifest.groups.find((g) => g.name === "pets")!;
    expect(pets.description).toBe("Manage pets");
    expect(pets.commands).toBe(5);

    const store = manifest.groups.find((g) => g.name === "store")!;
    expect(store.description).toBe("Store operations");
    expect(store.commands).toBe(3);
  });

  it("manifest is compact (under 600 tokens estimated)", async () => {
    const spec = await loadSpec(FIXTURE);
    const groups = extractOperations(spec);
    const manifest = generateManifest(groups, spec.info);
    const json = JSON.stringify(manifest);

    // Rough estimate: ~4 chars per token
    const estimatedTokens = json.length / 4;
    expect(estimatedTokens).toBeLessThan(600);
  });
});

describe("Phase 2: Group Detail", () => {
  it("lists all commands in the group", async () => {
    const spec = await loadSpec(FIXTURE);
    const groups = extractOperations(spec);
    const petsGroup = groups.find((g) => g.tag === "pets")!;
    const detail = generateGroupDetail(petsGroup);

    expect(detail.group).toBe("pets");
    expect(detail.commands).toHaveLength(5);
  });

  it("assigns correct hints based on HTTP method", async () => {
    const spec = await loadSpec(FIXTURE);
    const groups = extractOperations(spec);
    const petsGroup = groups.find((g) => g.tag === "pets")!;
    const detail = generateGroupDetail(petsGroup);

    const list = detail.commands.find((c) => c.name === "list")!;
    expect(list.hint).toBe("read-only");
    expect(list.method).toBe("GET");

    const create = detail.commands.find((c) => c.name === "create")!;
    expect(create.hint).toBe("write");
    expect(create.method).toBe("POST");

    const del = detail.commands.find((c) => c.name === "delete")!;
    expect(del.hint).toBe("destructive");
    expect(del.method).toBe("DELETE");
  });

  it("includes path param args", async () => {
    const spec = await loadSpec(FIXTURE);
    const groups = extractOperations(spec);
    const petsGroup = groups.find((g) => g.tag === "pets")!;
    const detail = generateGroupDetail(petsGroup);

    const get = detail.commands.find((c) => c.name === "get")!;
    expect(get.args).toEqual(["petId"]);

    const list = detail.commands.find((c) => c.name === "list")!;
    expect(list.args).toBeUndefined();
  });
});

describe("Phase 3: Command Schema", () => {
  it("generates full param list", async () => {
    const spec = await loadSpec(FIXTURE);
    const groups = extractOperations(spec);
    const petsGroup = groups.find((g) => g.tag === "pets")!;
    const createOp = petsGroup.operations.find((o) => o.id === "createPet")!;
    const schema = generateCommandSchema(createOp, "pets", spec);

    expect(schema.command).toBe("pets.create");
    expect(schema.params.length).toBeGreaterThan(0);

    const nameParam = schema.params.find((p) => p.name === "name")!;
    expect(nameParam.type).toBe("string");
    expect(nameParam.required).toBe(true);

    const statusParam = schema.params.find((p) => p.name === "status")!;
    expect(statusParam.type).toBe("enum");
    expect(statusParam.enum).toEqual(["available", "pending", "sold"]);
    expect(statusParam.default).toBe("available");
  });

  it("resolves bearer auth from spec", async () => {
    const spec = await loadSpec(FIXTURE);
    const groups = extractOperations(spec);
    const petsGroup = groups.find((g) => g.tag === "pets")!;
    const createOp = petsGroup.operations.find((o) => o.id === "createPet")!;
    const schema = generateCommandSchema(createOp, "pets", spec);

    expect(schema.auth.required).toBe(true);
    expect(schema.auth.scheme).toBe("bearer");
  });

  it("resolves apiKey auth from spec", async () => {
    const spec = await loadSpec(FIXTURE);
    const groups = extractOperations(spec);
    const storeGroup = groups.find((g) => g.tag === "store")!;
    const inventoryOp = storeGroup.operations.find((o) => o.id === "getInventory")!;
    const schema = generateCommandSchema(inventoryOp, "store", spec);

    expect(schema.auth.required).toBe(true);
    expect(schema.auth.scheme).toBe("apiKey:header:X-API-Key");
  });

  it("marks no auth when not required", async () => {
    const spec = await loadSpec(FIXTURE);
    const groups = extractOperations(spec);
    const petsGroup = groups.find((g) => g.tag === "pets")!;
    const listOp = petsGroup.operations.find((o) => o.id === "listPets")!;
    const schema = generateCommandSchema(listOp, "pets", spec);

    expect(schema.auth.required).toBe(false);
    expect(schema.auth.scheme).toBe("none");
  });
});
