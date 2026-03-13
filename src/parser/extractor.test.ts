import { describe, it, expect } from "vitest";
import { extractOperations } from "./extractor.js";
import { loadSpec } from "./loader.js";
import path from "node:path";

const FIXTURE = path.resolve("test/fixtures/petstore.yaml");

describe("extractOperations", () => {
  it("groups operations by tag", async () => {
    const spec = await loadSpec(FIXTURE);
    const groups = extractOperations(spec);

    const names = groups.map((g) => g.tag).sort();
    expect(names).toEqual(["pets", "store"]);
  });

  it("extracts correct number of operations per group", async () => {
    const spec = await loadSpec(FIXTURE);
    const groups = extractOperations(spec);

    const pets = groups.find((g) => g.tag === "pets")!;
    expect(pets.operations).toHaveLength(5); // list, create, get, update, delete

    const store = groups.find((g) => g.tag === "store")!;
    expect(store.operations).toHaveLength(3); // getInventory, placeOrder, getOrder
  });

  it("uses operationId from spec", async () => {
    const spec = await loadSpec(FIXTURE);
    const groups = extractOperations(spec);
    const pets = groups.find((g) => g.tag === "pets")!;

    const ids = pets.operations.map((o) => o.id).sort();
    expect(ids).toEqual(["createPet", "deletePet", "getPet", "listPets", "updatePet"]);
  });

  it("generates operationId when missing", async () => {
    const spec = await loadSpec(FIXTURE);
    // Remove operationIds
    for (const pathItem of Object.values(spec.paths)) {
      for (const method of ["get", "post", "put", "delete"] as const) {
        if (pathItem[method]) {
          delete pathItem[method]!.operationId;
        }
      }
    }

    const groups = extractOperations(spec);
    const pets = groups.find((g) => g.tag === "pets")!;

    // Should generate reasonable IDs
    const ids = pets.operations.map((o) => o.id);
    expect(ids).toContain("listPets");
    expect(ids).toContain("createPet");
    expect(ids).toContain("getPet");
  });

  it("extracts path params", async () => {
    const spec = await loadSpec(FIXTURE);
    const groups = extractOperations(spec);
    const pets = groups.find((g) => g.tag === "pets")!;
    const getPet = pets.operations.find((o) => o.id === "getPet")!;

    const petIdParam = getPet.params.find((p) => p.name === "petId");
    expect(petIdParam).toBeDefined();
    expect(petIdParam!.in).toBe("path");
    expect(petIdParam!.required).toBe(true);
    expect(petIdParam!.type).toBe("integer");
  });

  it("extracts query params with enums", async () => {
    const spec = await loadSpec(FIXTURE);
    const groups = extractOperations(spec);
    const pets = groups.find((g) => g.tag === "pets")!;
    const listPets = pets.operations.find((o) => o.id === "listPets")!;

    const statusParam = listPets.params.find((p) => p.name === "status");
    expect(statusParam).toBeDefined();
    expect(statusParam!.in).toBe("query");
    expect(statusParam!.type).toBe("enum");
    expect(statusParam!.enum).toEqual(["available", "pending", "sold"]);
  });

  it("extracts request body fields as body params", async () => {
    const spec = await loadSpec(FIXTURE);
    const groups = extractOperations(spec);
    const pets = groups.find((g) => g.tag === "pets")!;
    const createPet = pets.operations.find((o) => o.id === "createPet")!;

    const nameParam = createPet.params.find((p) => p.name === "name");
    expect(nameParam).toBeDefined();
    expect(nameParam!.in).toBe("body");
    expect(nameParam!.required).toBe(true);
    expect(nameParam!.type).toBe("string");

    const statusParam = createPet.params.find((p) => p.name === "status");
    expect(statusParam).toBeDefined();
    expect(statusParam!.in).toBe("body");
    expect(statusParam!.type).toBe("enum");
    expect(statusParam!.enum).toEqual(["available", "pending", "sold"]);
    expect(statusParam!.default).toBe("available");
  });

  it("extracts security requirements", async () => {
    const spec = await loadSpec(FIXTURE);
    const groups = extractOperations(spec);
    const pets = groups.find((g) => g.tag === "pets")!;
    const createPet = pets.operations.find((o) => o.id === "createPet")!;

    expect(createPet.security).toHaveLength(1);
    expect(createPet.security[0]).toHaveProperty("bearerAuth");
  });

  it("includes tag descriptions", async () => {
    const spec = await loadSpec(FIXTURE);
    const groups = extractOperations(spec);

    const pets = groups.find((g) => g.tag === "pets")!;
    expect(pets.description).toBe("Manage pets");

    const store = groups.find((g) => g.tag === "store")!;
    expect(store.description).toBe("Store operations");
  });

  it("handles untagged operations under 'default'", async () => {
    const spec = await loadSpec(FIXTURE);
    // Remove tags from one operation
    const listOp = spec.paths["/pets"]?.get;
    if (listOp) listOp.tags = undefined;

    const groups = extractOperations(spec);
    const defaultGroup = groups.find((g) => g.tag === "default");
    expect(defaultGroup).toBeDefined();
    expect(defaultGroup!.operations.length).toBeGreaterThan(0);
  });
});
