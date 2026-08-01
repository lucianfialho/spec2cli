// Generates a synthetic OpenAPI 3.0 spec with N operations across M tags.
import { writeFileSync } from "node:fs";

const n = Number(process.argv[2] ?? 100);
const tags = Number(process.argv[3] ?? 10);
const out = process.argv[4];

const spec = {
  openapi: "3.0.0",
  info: { title: `Synthetic API (${n} ops)`, version: "1.0.0" },
  servers: [{ url: "http://localhost:8787" }],
  tags: Array.from({ length: tags }, (_, i) => ({ name: `group${i}` })),
  paths: {},
  components: {
    schemas: {
      Item: {
        type: "object",
        properties: {
          id: { type: "integer" },
          name: { type: "string" },
          status: { type: "string", enum: ["active", "archived", "draft"] },
          count: { type: "integer" },
        },
        required: ["name"],
      },
    },
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer" },
    },
  },
  security: [{ bearerAuth: [] }],
};

for (let i = 0; i < n; i++) {
  const tag = `group${i % tags}`;
  spec.paths[`/${tag}/resource${i}/{resourceId}`] = {
    get: {
      operationId: `get${tag}Resource${i}`,
      summary: `Fetch resource ${i}`,
      tags: [tag],
      parameters: [
        { name: "resourceId", in: "path", required: true, schema: { type: "string" } },
        { name: "limit", in: "query", schema: { type: "integer", default: 10 } },
        { name: "status", in: "query", schema: { type: "string", enum: ["active", "archived"] } },
      ],
      responses: { "200": { description: "ok", content: { "application/json": { schema: { $ref: "#/components/schemas/Item" } } } } },
    },
    post: {
      operationId: `create${tag}Resource${i}`,
      summary: `Create resource ${i}`,
      tags: [tag],
      parameters: [{ name: "resourceId", in: "path", required: true, schema: { type: "string" } }],
      requestBody: {
        required: true,
        content: { "application/json": { schema: { $ref: "#/components/schemas/Item" } } },
      },
      responses: { "201": { description: "created" } },
    },
  };
}

writeFileSync(out, JSON.stringify(spec, null, 2));
console.log(`${out}: ${n * 2} operations, ${tags} tags, ${(JSON.stringify(spec).length / 1024).toFixed(1)} KB`);
