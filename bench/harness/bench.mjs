// Latency benchmark for spec2cli: measures wall-clock of full CLI invocations.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile);

const CLI = "/Users/lucianfialho/Code/tocli/dist/index.js";
const SP = "/private/tmp/claude-501/-Users-lucianfialho-Code-tocli/acd780f2-f38e-4f4c-bee1-44923cba090b/scratchpad";
const RUNS = 12;
const WARMUP = 3;

const SPECS = [
  ["petstore (real, 19 ops)", `${SP}/petstore-real.json`],
  ["small (20 ops)", `${SP}/small.json`],
  ["medium (200 ops)", `${SP}/medium.json`],
  ["large (1000 ops)", `${SP}/large.json`],
];

async function time(args) {
  const t0 = process.hrtime.bigint();
  try {
    await exec("node", [CLI, ...args], { maxBuffer: 64 * 1024 * 1024 });
  } catch {
    /* non-zero exit is fine, we measure wall clock */
  }
  return Number(process.hrtime.bigint() - t0) / 1e6;
}

function stats(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const mean = s.reduce((a, b) => a + b, 0) / s.length;
  return {
    min: s[0],
    p50: s[Math.floor(s.length * 0.5)],
    p95: s[Math.floor(s.length * 0.95)],
    mean,
  };
}

async function measure(label, args) {
  for (let i = 0; i < WARMUP; i++) await time(args);
  const xs = [];
  for (let i = 0; i < RUNS; i++) xs.push(await time(args));
  const s = stats(xs);
  console.log(
    `  ${label.padEnd(30)} p50 ${s.p50.toFixed(0).padStart(5)}ms   p95 ${s.p95.toFixed(0).padStart(5)}ms   min ${s.min.toFixed(0).padStart(5)}ms`
  );
  return s;
}

console.log("\n=== Node baseline (floor) ===");
await measure("node -e ''", []).catch(() => {});
{
  const xs = [];
  for (let i = 0; i < RUNS; i++) {
    const t0 = process.hrtime.bigint();
    await exec("node", ["-e", ""]);
    xs.push(Number(process.hrtime.bigint() - t0) / 1e6);
  }
  const s = stats(xs);
  console.log(`  ${"bare node startup".padEnd(30)} p50 ${s.p50.toFixed(0).padStart(5)}ms`);
}

for (const [name, path] of SPECS) {
  console.log(`\n=== ${name} ===`);
  await measure("--help (root)", ["--spec", path, "--help"]);
  await measure("--agent-help", ["--spec", path, "--agent-help"]);
  await measure("group0 --help", ["--spec", path, "group0", "--help"]);
}

console.log("\n=== Remote spec: cache cold vs warm ===");
const REMOTE = "https://petstore3.swagger.io/api/v3/openapi.json";
const { rm } = await import("node:fs/promises");
const { join } = await import("node:path");
const { homedir } = await import("node:os");
const cacheDir = join(process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"), "spec2cli", "specs");

const cold = [];
for (let i = 0; i < 6; i++) {
  await rm(cacheDir, { recursive: true, force: true });
  cold.push(await time(["--spec", REMOTE, "--help"]));
}
const warm = [];
for (let i = 0; i < 6; i++) warm.push(await time(["--spec", REMOTE, "--help"]));

const c = stats(cold), w = stats(warm);
console.log(`  ${"cold (cache purged)".padEnd(30)} p50 ${c.p50.toFixed(0).padStart(5)}ms   min ${c.min.toFixed(0).padStart(5)}ms`);
console.log(`  ${"warm (cache hit)".padEnd(30)} p50 ${w.p50.toFixed(0).padStart(5)}ms   min ${w.min.toFixed(0).padStart(5)}ms`);
console.log(`  cache saves ~${(c.p50 - w.p50).toFixed(0)}ms per invocation`);
