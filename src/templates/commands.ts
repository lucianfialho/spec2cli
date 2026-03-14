import type { Command } from "commander";
import { execSync } from "node:child_process";
import { templates, getTemplate } from "./registry.js";

export function registerUseCommand(program: Command): void {
  // We handle 'use' by intercepting before commander processes it
  // This avoids commander eating --help and other flags meant for the inner command

  const originalParse = program.parse.bind(program);

  program.parse = ((argv?: string[], opts?: { from: "node" | "electron" | "user" }) => {
    const args = (argv ?? process.argv).slice(2);

    if (args[0] === "use") {
      handleUse(args.slice(1));
      return program;
    }

    return originalParse(argv, opts);
  }) as typeof program.parse;
}

function handleUse(args: string[]): void {
  if (args.length === 0 || args[0] === "--list") {
    printTemplateList();
    return;
  }

  const apiName = args[0];
  const template = getTemplate(apiName);

  if (!template) {
    console.error(`Unknown API: '${apiName}'.\n`);
    printTemplateList();
    process.exit(1);
  }

  // Build tocli command with template config
  const tocliArgs = [
    process.argv[1],
    "--spec", `"${template.specUrl}"`,
    "--base-url", template.baseUrl,
  ];

  // Add auth from env var
  const token = process.env[template.authEnvVar];
  if (token && template.authType === "bearer") {
    tocliArgs.push("--token", token);
  } else if (token && template.authType === "apiKey") {
    tocliArgs.push("--api-key", token);
  }

  // Forward everything after 'use <api>'
  const remaining = args.slice(1);
  if (remaining.length === 0) {
    tocliArgs.push("--help");
  } else {
    tocliArgs.push(...remaining);
  }

  const cmd = `node ${tocliArgs.join(" ")}`;

  try {
    const result = execSync(cmd, {
      encoding: "utf-8",
      stdio: ["inherit", "pipe", "pipe"],
      timeout: 30000,
    });
    if (result) process.stdout.write(result);
  } catch (err) {
    const e = err as { stderr?: string; stdout?: string; status?: number };
    if (e.stdout) process.stdout.write(e.stdout);
    if (e.stderr) process.stderr.write(e.stderr);
    process.exit(e.status ?? 1);
  }
}

function printTemplateList(): void {
  console.log("Available API templates:\n");

  const maxName = Math.max(...templates.map((t) => t.name.length));

  for (const t of templates) {
    const auth = t.authType === "none" ? "" : `  (set ${t.authEnvVar})`;
    console.log(`  ${t.name.padEnd(maxName + 2)} ${t.description}${auth}`);
  }

  console.log(`\nUsage: tocli use <api> <group> <command> [--flags]`);
  console.log(`Example: tocli use petstore pet findpetsbystatus --status available`);
}
