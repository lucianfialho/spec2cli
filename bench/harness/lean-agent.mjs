// Phase B on a lean agent loop, instead of Claude Code.
//
// The crossover Phase B measured (~880 operations) is a property of the agent,
// not of spec2cli: Claude Code resends ~31k tokens of its own context every
// turn, which is what makes an extra discovery step so expensive. A loop with a
// minimal system prompt resends far less, so the same experiment should put the
// crossover somewhere much lower — and that number is what decides whether
// progressive disclosure is worth defaulting to at ordinary spec sizes.
//
// Needs ANTHROPIC_API_KEY. Usage:
//   node bench/harness/lean-agent.mjs <arm> [--model <id>]
//     arm: mcp | cli | cli-flat
import { execFile } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { promisify } from "node:util";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { TASKS } from "./tasks.mjs";

const exec = promisify(execFile);
const BENCH = dirname(dirname(fileURLToPath(import.meta.url)));
const REPO = dirname(BENCH);
const CLI = join(REPO, "dist", "index.js");
const SPEC = join(BENCH, "specs", "combined.json");

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) {
  console.error("ANTHROPIC_API_KEY is not set — this harness cannot run without it.");
  process.exit(1);
}

const MODEL = process.argv.includes("--model")
  ? process.argv[process.argv.indexOf("--model") + 1]
  : "claude-sonnet-5";

// Deliberately minimal. Every token here is resent on every turn, which is the
// whole variable this harness exists to change.
const SYSTEM = "You answer using the provided tool. Do not compute anything yourself.";

const BASH_TOOL = {
  name: "run",
  description: "Run a shell command and return its stdout and stderr.",
  input_schema: {
    type: "object",
    properties: { command: { type: "string" } },
    required: ["command"],
  },
};

async function runCommand(command) {
  try {
    const { stdout, stderr } = await exec("bash", ["-lc", command], {
      cwd: REPO,
      maxBuffer: 8 * 1024 * 1024,
      timeout: 60_000,
    });
    return (stdout + stderr).slice(0, 20_000) || "(no output)";
  } catch (err) {
    return `exit ${err.code ?? 1}\n${(err.stdout ?? "") + (err.stderr ?? err.message)}`.slice(0, 20_000);
  }
}

async function callModel(messages, tools) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ model: MODEL, max_tokens: 2048, system: SYSTEM, tools, messages }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

async function runTask(task, prompt, tools, dispatch) {
  const messages = [{ role: "user", content: prompt }];
  let turns = 0;
  let inputTokens = 0;
  let outputTokens = 0;

  for (let i = 0; i < 30; i++) {
    const reply = await callModel(messages, tools);
    turns++;
    inputTokens += reply.usage.input_tokens + (reply.usage.cache_read_input_tokens ?? 0);
    outputTokens += reply.usage.output_tokens;

    messages.push({ role: "assistant", content: reply.content });

    const calls = reply.content.filter((c) => c.type === "tool_use");
    if (calls.length === 0) {
      const text = reply.content.filter((c) => c.type === "text").map((c) => c.text).join("");
      return { turns, inputTokens, outputTokens, text };
    }

    const results = [];
    for (const call of calls) {
      results.push({
        type: "tool_result",
        tool_use_id: call.id,
        content: await dispatch(call),
      });
    }
    messages.push({ role: "user", content: results });
  }

  return { turns, inputTokens, outputTokens, text: "(turn limit reached)" };
}

const arm = process.argv[2] ?? "cli";

async function flatCatalog() {
  const { stdout } = await exec("node", [CLI, "--spec", SPEC, "--agent-help", "--all"], {
    maxBuffer: 16 * 1024 * 1024,
  });
  return stdout;
}

const results = [];
for (const task of TASKS) {
  let prompt = task.prompt;
  if (arm === "cli") {
    prompt =
      `Run commands with the \`run\` tool.\n\n` +
      `  node ${CLI} --spec ${SPEC} <group> <command> [--flag value] --output json\n\n` +
      `Discover it with --agent-help --progressive, then --agent-help <group>, ` +
      `then --agent-help <group> <command>.\n\n${task.prompt}`;
  } else if (arm === "cli-flat") {
    prompt =
      `Run commands with the \`run\` tool.\n\n` +
      `  node ${CLI} --spec ${SPEC} <group> <command> [--flag value] --output json\n\n` +
      `Catalog:\n\n${await flatCatalog()}\n\n${task.prompt}`;
  }

  process.stderr.write(`${arm}/${task.id}... `);
  const r = await runTask(task, prompt, [BASH_TOOL], (call) => runCommand(call.input.command));
  const ok = task.expect instanceof RegExp ? task.expect.test(r.text) : r.text.includes(task.expect);
  results.push({ arm, task: task.id, ...r, ok });
  process.stderr.write(`${r.turns} turns, ${r.inputTokens.toLocaleString()} in, ${ok ? "ok" : "MISS"}\n`);
}

mkdirSync(join(BENCH, "results"), { recursive: true });
writeFileSync(join(BENCH, "results", `lean-${arm}.json`), JSON.stringify(results, null, 2));

const turns = results.reduce((a, r) => a + r.turns, 0);
const tokens = results.reduce((a, r) => a + r.inputTokens, 0);
console.error(`\n${arm}: ${turns} turns, ${tokens.toLocaleString()} input tokens`);
console.error(`context resent per turn: ~${Math.round(tokens / turns).toLocaleString()}`);
