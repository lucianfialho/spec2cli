import { describe, it, expect } from "vitest";
import { extractOperations } from "./extractor.js";
import type { OpenAPISpec } from "./types.js";

describe("flag name collisions", () => {
  it("keeps one parameter when a name appears in two places", () => {
    // `--labels` can only mean one thing, whatever the spec declares twice.
    const spec: OpenAPISpec = {
      openapi: "3.1.0",
      info: { title: "API", version: "1.0" },
      paths: {
        "/images": {
          post: {
            operationId: "createImage",
            tags: ["images"],
            parameters: [{ name: "labels", in: "query", required: false, schema: { type: "string" } }],
            requestBody: {
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: { labels: { type: "array", items: { type: "string" } } },
                  },
                },
              },
            },
          },
        },
      },
    };

    const params = extractOperations(spec)[0].operations[0].params;
    expect(params.filter((p) => p.name === "labels")).toHaveLength(1);
    expect(params[0].in).toBe("query"); // the earlier declaration wins
  });

  it("keeps one parameter when two real parameters share a name", () => {
    // Both are declared parameters, in different locations — neither is a body
    // field, so a body-only guard misses this and two `--id` flags reach
    // Commander, which throws while the command tree is built.
    const spec: OpenAPISpec = {
      openapi: "3.1.0",
      info: { title: "API", version: "1.0" },
      paths: {
        "/items/{id}": {
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          get: {
            operationId: "getItem",
            tags: ["items"],
            parameters: [{ name: "id", in: "query", required: false, schema: { type: "string" } }],
          },
        },
      },
    };

    const params = extractOperations(spec)[0].operations[0].params;
    expect(params.filter((p) => p.name === "id")).toHaveLength(1);
  });

  it("keeps the path parameter when the body repeats its name", () => {
    const spec: OpenAPISpec = {
      openapi: "3.1.0",
      info: { title: "API", version: "1.0" },
      paths: {
        "/items/{id}": {
          put: {
            operationId: "updateItem",
            tags: ["items"],
            parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
            requestBody: {
              content: {
                "application/json": {
                  schema: { type: "object", properties: { id: { type: "string" }, name: { type: "string" } } },
                },
              },
            },
          },
        },
      },
    };

    const params = extractOperations(spec)[0].operations[0].params;
    expect(params.filter((p) => p.name === "id")).toHaveLength(1);
    expect(params.find((p) => p.name === "id")!.in).toBe("path");
  });
});
