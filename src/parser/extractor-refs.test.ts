import { describe, it, expect } from "vitest";
import { extractOperations } from "./extractor.js";
import type { OpenAPISpec } from "./types.js";

/** Shapes real specs use that a naive reader mishandles. */
describe("parameter references", () => {
  it("resolves a reusable parameter ref", () => {
    const spec: OpenAPISpec = {
      openapi: "3.1.0",
      info: { title: "API", version: "1.0" },
      paths: {
        "/pets": {
          parameters: [{ $ref: "#/components/parameters/TraceId" }],
          get: { operationId: "listPets", tags: ["pets"] },
        },
      },
      components: {
        parameters: {
          TraceId: { name: "X-Trace-Id", in: "header", required: false, schema: { type: "string" } },
        },
      },
    };

    const trace = extractOperations(spec)[0].operations[0].params.find((p) => p.name === "X-Trace-Id");
    expect(trace).toMatchObject({ in: "header", type: "string" });
  });

  it("skips an unresolved ref rather than inventing an undefined param", () => {
    const spec: OpenAPISpec = {
      openapi: "3.1.0",
      info: { title: "API", version: "1.0" },
      paths: {
        "/": {
          parameters: [{ $ref: "#/components/parameters/Missing" }],
          get: {
            operationId: "listItems",
            tags: ["items"],
            parameters: [{ name: "limit", in: "query", required: false, schema: { type: "integer" } }],
          },
        },
      },
      components: { parameters: {} },
    };

    expect(extractOperations(spec)[0].operations[0].params.map((p) => p.name)).toEqual(["limit"]);
  });

  it("decodes JSON Pointer escapes, so a ref can name a path", () => {
    // `~1` is the only way to write `/` inside a pointer segment (RFC 6901),
    // which any ref pointing into `paths` has to do. The referenced parameter
    // lives under a different path, so it reaches the operation only if the
    // pointer actually resolves.
    const spec: OpenAPISpec = {
      openapi: "3.1.0",
      info: { title: "API", version: "1.0" },
      paths: {
        "/pets": {
          parameters: [{ name: "tenant", in: "query", required: true, schema: { type: "string" } }],
        },
        "/orders": {
          get: {
            operationId: "listOrders",
            tags: ["orders"],
            parameters: [{ $ref: "#/paths/~1pets/parameters/0" }],
          },
        },
      },
    };

    const names = extractOperations(spec)[0].operations[0].params.map((p) => p.name);
    expect(names).toEqual(["tenant"]);
  });

  it("does not walk into a non-object when the pointer overshoots", () => {
    const spec: OpenAPISpec = {
      openapi: "3.1.0",
      info: { title: "API", version: "1.0" },
      paths: {
        "/": {
          get: {
            operationId: "listItems",
            tags: ["items"],
            parameters: [{ $ref: "#/info/title/nope" }],
          },
        },
      },
    };

    expect(extractOperations(spec)[0].operations[0].params).toEqual([]);
  });
});
