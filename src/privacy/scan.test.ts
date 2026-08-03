import { describe, it, expect } from "vitest";
import { scanSpecForPii, groupBySchema, operationsExposing } from "./scan.js";
import type { OpenAPISpec } from "../parser/types.js";

const spec: OpenAPISpec = {
  openapi: "3.0.0",
  info: { title: "Shop", version: "1" },
  paths: {
    "/customers": {
      get: {
        operationId: "listCustomers",
        responses: {
          "200": { content: { "application/json": { schema: { $ref: "#/components/schemas/Customer" } } } },
        },
      },
    },
    "/orders": {
      get: {
        operationId: "listOrders",
        responses: {
          "200": { content: { "application/json": { schema: { $ref: "#/components/schemas/Order" } } } },
        },
      },
    },
  },
  components: {
    schemas: {
      Customer: {
        type: "object",
        properties: {
          id: { type: "integer" },
          email: { type: "string", format: "email" },
          full_name: { type: "string" },
        },
      },
      Order: { type: "object", properties: { id: { type: "integer" }, total: { type: "number" } } },
    },
  },
};

describe("scanSpecForPii", () => {
  it("reports the fields the filter would redact", () => {
    expect(scanSpecForPii(spec).map((f) => f.path)).toEqual(
      expect.arrayContaining(["Customer.email", "Customer.full_name"])
    );
  });

  it("leaves ordinary fields alone", () => {
    const paths = scanSpecForPii(spec).map((f) => f.path);
    expect(paths).not.toContain("Customer.id");
    expect(paths.some((p) => p.startsWith("Order."))).toBe(false);
  });

  it("splits each finding into its schema and field", () => {
    const email = scanSpecForPii(spec).find((f) => f.path === "Customer.email")!;
    expect(email).toMatchObject({ schema: "Customer", field: "email" });
  });

  it("returns nothing for a spec with no schemas", () => {
    expect(scanSpecForPii({ ...spec, components: undefined })).toEqual([]);
  });
});

describe("groupBySchema", () => {
  it("collects fields under the type that declares them", () => {
    const grouped = groupBySchema(scanSpecForPii(spec));
    expect([...grouped.keys()]).toEqual(["Customer"]);
    expect(grouped.get("Customer")).toEqual(expect.arrayContaining(["email", "full_name"]));
  });
});

describe("operationsExposing", () => {
  it("names the operations that return a flagged schema", () => {
    expect(operationsExposing(spec, new Set(["Customer"]))).toEqual(["GET /customers"]);
  });

  it("does not implicate operations returning something else", () => {
    expect(operationsExposing(spec, new Set(["Customer"]))).not.toContain("GET /orders");
  });

  it("is empty when nothing was flagged", () => {
    expect(operationsExposing(spec, new Set())).toEqual([]);
  });
});
