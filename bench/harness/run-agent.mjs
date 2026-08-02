// Phase B: turns and tokens for a real agent loop, MCP arm vs spec2cli arm.
//
// Both arms use the same agent (claude -p), the same model, and the same tasks.
// They reach the same MCP servers — the MCP arm speaks the protocol directly,
// the CLI arm goes through the shim. Only the access layer differs.
//
// Usage: node run-agent.mjs <task-id|all> [--arm mcp|cli] [--runs N]
import { execFile } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { promisify } from "node:util";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { TASKS, cliPreamble, flatPreamble } from "./tasks.mjs";

const exec = promisify(execFile);
const BENCH = dirname(dirname(fileURLToPath(import.meta.url)));
const REPO = dirname(BENCH);
const CLI = join(REPO, "dist", "index.js");
const SPEC = join(BENCH, "specs", "combined.json");
const MCP_CONFIG = join(BENCH, "mcp-config.json");

async function flatCatalog() {
  const { stdout } = await exec("node", [CLI, "--spec", SPEC, "--agent-help", "--all"], {
    maxBuffer: 16 * 1024 * 1024,
  });
  return stdout;
}

async function runArm(arm, task) {
  let prompt = task.prompt;
  if (arm === "cli") prompt = cliPreamble(CLI, SPEC) + task.prompt;
  if (arm === "cli-flat") prompt = flatPreamble(CLI, SPEC, await flatCatalog()) + task.prompt;

  const args = ["-p", prompt, "--output-format", "json", "--max-turns", "30"];
  if (arm === "mcp") {
    args.push("--mcp-config", MCP_CONFIG, "--strict-mcp-config");
    // This Claude Code build defers MCP tool schemas, so the agent must be able
    // to call ToolSearch to load them. Without it the tools are named but
    // unusable and the agent falls back to the open web. See bench/README.md —
    // it also means this arm is not a clean stand-in for flat MCP injection.
    args.push("--allowedTools", "ToolSearch,mcp__math,mcp__met,mcp__nixos");
  } else {
    args.push("--allowedTools", "Bash");
  }

  const started = Date.now();
  const { stdout } = await exec("claude", args, {
    maxBuffer: 64 * 1024 * 1024,
    cwd: REPO,
  });
  const wall = Date.now() - started;

  const r = JSON.parse(stdout);
  const u = r.usage ?? {};
  const input = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);

  return {
    arm,
    task: task.id,
    turns: r.num_turns,
    input_tokens: input,
    output_tokens: u.output_tokens ?? 0,
    cost_usd: r.total_cost_usd,
    wall_ms: wall,
    ok: task.expect instanceof RegExp
      ? task.expect.test(r.result ?? "")
      : String(r.result ?? "").includes(task.expect),
    result: (r.result ?? "").slice(0, 400),
    is_error: r.is_error,
  };
}

const which = process.argv[2] ?? "all";
const armFilter = process.argv.includes("--arm")
  ? process.argv[process.argv.indexOf("--arm") + 1]
  : null;
const runs = process.argv.includes("--runs")
  ? Number(process.argv[process.argv.indexOf("--runs") + 1])
  : 1;

const tasks = which === "all" ? TASKS : TASKS.filter((t) => t.id === which);
const arms = armFilter ? [armFilter] : ["mcp", "cli", "cli-flat"];

const results = [];
for (const task of tasks) {
  for (const arm of arms) {
    for (let i = 0; i < runs; i++) {
      process.stderr.write(`running ${arm}/${task.id} (${i + 1}/${runs})... `);
      try {
        const r = await runArm(arm, task);
        results.push(r);
        process.stderr.write(
          `${r.turns} turns, ${r.input_tokens.toLocaleString()} in, $${r.cost_usd.toFixed(3)}, ${r.ok ? "ok" : "MISS"}\n`
        );
      } catch (err) {
        process.stderr.write(`FAILED: ${err.message.slice(0, 160)}\n`);
        results.push({ arm, task: task.id, error: err.message.slice(0, 400) });
      }
    }
  }
}

mkdirSync(join(BENCH, "results"), { recursive: true });
const out = join(BENCH, "results", `phase-b-${which}.json`);
writeFileSync(out, JSON.stringify(results, null, 2));
console.error(`\nwrote ${out}`);

const totalCost = results.reduce((a, r) => a + (r.cost_usd ?? 0), 0);
console.error(`total cost: $${totalCost.toFixed(2)}`);
