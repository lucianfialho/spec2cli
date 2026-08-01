// Minimal MCP stdio client: initialize + tools/list, dumps raw tool schemas.
// Usage: node mcp-dump.mjs <cwd> <cmd> [args...]
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";

const [cwd, cmd, ...args] = process.argv.slice(2);
const proc = spawn(cmd, args, { cwd, stdio: ["pipe", "pipe", "pipe"] });

let buf = "";
const pending = new Map();
let nextId = 1;

proc.stdout.on("data", (d) => {
  buf += d.toString();
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    if (msg.id !== undefined && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  }
});
proc.stderr.on("data", () => {}); // servers log noisily to stderr

function send(method, params) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, resolve);
    proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    setTimeout(() => reject(new Error(`timeout: ${method}`)), 25000);
  });
}
function notify(method, params) {
  proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
}

try {
  const init = await send("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "footprint-probe", version: "1.0.0" },
  });
  notify("notifications/initialized", {});
  const list = await send("tools/list", {});
  const tools = list.result?.tools ?? [];

  const out = {
    server: init.result?.serverInfo?.name ?? cmd,
    protocolVersion: init.result?.protocolVersion,
    toolCount: tools.length,
    tools,
  };
  const dest = process.env.OUT ?? "/dev/stdout";
  writeFileSync(dest, JSON.stringify(out, null, 2));
  console.error(`${out.server}: ${tools.length} tools -> ${dest}`);
} catch (e) {
  console.error(`FAILED: ${e.message}`);
  process.exitCode = 1;
} finally {
  proc.kill();
}
