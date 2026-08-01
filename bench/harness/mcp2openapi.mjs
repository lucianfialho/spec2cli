// Converts an MCP tools/list dump into an OpenAPI 3.0 spec.
// Each MCP tool -> POST /tools/{name}, requestBody = the tool's inputSchema.
// This keeps the comparison honest: same tools, same schemas, only access layer differs.
import { readFileSync, writeFileSync } from "node:fs";

const [src, dest, tagName] = process.argv.slice(2);
const dump = JSON.parse(readFileSync(src, "utf-8"));

const tag = tagName ?? dump.server.replace(/[^a-zA-Z0-9]/g, "");

const spec = {
  openapi: "3.0.0",
  info: { title: dump.server, version: "1.0.0" },
  servers: [{ url: "http://localhost:8901" }],
  tags: [{ name: tag }],
  paths: {},
};

for (const tool of dump.tools) {
  const schema = tool.inputSchema ?? { type: "object", properties: {} };
  spec.paths[`/tools/${tool.name}`] = {
    post: {
      operationId: tool.name,
      summary: (tool.description ?? "").split("\n")[0].slice(0, 300),
      description: tool.description,
      tags: [tag],
      requestBody: {
        required: (schema.required ?? []).length > 0,
        content: { "application/json": { schema } },
      },
      responses: {
        "200": { description: "tool result", content: { "application/json": { schema: { type: "object" } } } },
      },
    },
  };
}

writeFileSync(dest, JSON.stringify(spec, null, 2));
console.error(`${dump.server}: ${dump.tools.length} tools -> ${dest}`);
