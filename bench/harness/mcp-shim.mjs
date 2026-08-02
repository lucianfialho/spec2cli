// HTTP front for MCP servers: POST /tools/{name} -> tools/call on the server.
//
// mcp2openapi.mjs describes these endpoints; this makes them real, so spec2cli
// can actually invoke the same tools an MCP client would. Both arms then reach
// identical implementations and only the access layer differs.
//
// Usage: node mcp-shim.mjs <port> <name>=<cwd>:<cmd...> [<name>=<cwd>:<cmd...>]
import { createServer } from "node:http";
import { spawn } from "node:child_process";

class McpClient {
  constructor(name, cwd, argv) {
    this.name = name;
    this.pending = new Map();
    this.nextId = 1;
    this.buf = "";
    this.proc = spawn(argv[0], argv.slice(1), { cwd, stdio: ["pipe", "pipe", "pipe"] });
    this.proc.stdout.on("data", (d) => this.onData(d));
    this.proc.stderr.on("data", () => {}); // servers log noisily
  }

  onData(chunk) {
    this.buf += chunk.toString();
    let i;
    while ((i = this.buf.indexOf("\n")) >= 0) {
      const line = this.buf.slice(0, i).trim();
      this.buf = this.buf.slice(i + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { continue; }
      const resolve = this.pending.get(msg.id);
      if (resolve) {
        this.pending.delete(msg.id);
        resolve(msg);
      }
    }
  }

  send(method, params) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, resolve);
      this.proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
      setTimeout(() => {
        if (this.pending.delete(id)) reject(new Error(`timeout: ${method}`));
      }, 60000);
    });
  }

  async start() {
    await this.send("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "spec2cli-bench-shim", version: "1.0.0" },
    });
    this.proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }) + "\n");

    const list = await this.send("tools/list", {});
    this.tools = new Set((list.result?.tools ?? []).map((t) => t.name));
    return this.tools.size;
  }

  call(tool, args) {
    return this.send("tools/call", { name: tool, arguments: args });
  }
}

const [portArg, ...serverArgs] = process.argv.slice(2);
const port = Number(portArg);

const clients = [];
for (const arg of serverArgs) {
  const eq = arg.indexOf("=");
  const colon = arg.indexOf(":", eq);
  const name = arg.slice(0, eq);
  const cwd = arg.slice(eq + 1, colon);
  const argv = arg.slice(colon + 1).split(" ");
  const client = new McpClient(name, cwd, argv);
  const n = await client.start();
  clients.push(client);
  console.error(`[shim] ${name}: ${n} tools`);
}

/** Routes a tool name to whichever server declared it. */
function findClient(tool) {
  return clients.find((c) => c.tools.has(tool));
}

const server = createServer(async (req, res) => {
  const match = /^\/tools\/([^/?]+)/.exec(req.url ?? "");
  if (!match || req.method !== "POST") {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
    return;
  }

  const tool = decodeURIComponent(match[1]);
  const client = findClient(tool);
  if (!client) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: `unknown tool: ${tool}` }));
    return;
  }

  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString() || "{}";

  let args;
  try {
    args = JSON.parse(raw);
  } catch {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "invalid JSON body" }));
    return;
  }

  try {
    const reply = await client.call(tool, args);
    if (reply.error) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: reply.error.message ?? "tool error" }));
      return;
    }
    // Unwrap the MCP content envelope: the CLI arm should see the tool's own
    // payload, exactly as the MCP arm's client would surface it to the model.
    const content = reply.result?.content ?? [];
    const text = content.map((c) => c.text ?? "").join("\n");
    res.writeHead(reply.result?.isError ? 500 : 200, { "content-type": "application/json" });
    res.end(JSON.stringify({ result: text }));
  } catch (err) {
    res.writeHead(504, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: err.message }));
  }
});

server.listen(port, () => console.error(`[shim] listening on http://localhost:${port}`));

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    for (const c of clients) c.proc.kill();
    process.exit(0);
  });
}
