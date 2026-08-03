#!/usr/bin/env node

import { loadSpec } from "./parser/loader.js";
import { extractOperations } from "./parser/extractor.js";
import { resolveAuth as resolveAuthFromFlags } from "./auth/flags.js";
import { createProgram } from "./cli/program.js";
import { loadConfig, resolveConfig } from "./config/rc.js";
import { scanSchema } from "@lucianfialho/pii-filter";
import { buildDynamicCommands } from "./cli/dynamic-commands.js";
import { printAgentHelp, parseAgentHelpSelector } from "./cli/agent-help.js";
import { resolveBaseUrl } from "./cli/spec-hints.js";
import { getFlagValue, parseHeaderArgs, filterTocliFlags } from "./cli/flags.js";
import { fail } from "./cli/errors.js";
import type { RuntimeConfig } from "./executor/types.js";

const program = createProgram();

async function main() {
  const rawArgs = process.argv.slice(2);
  const envName = getFlagValue(rawArgs, "--env");

  const firstArg = rawArgs[0];
  if (["auth", "init", "use", "search", "add", "remove", "privacy"].includes(firstArg ?? "")) {
    program.parse(process.argv);
    return;
  }

  let specPath = getFlagValue(rawArgs, "--spec");
  let configBaseUrl: string | undefined;
  let rcAuthType: string | undefined;
  let rcAuthToken: string | undefined;
  let rcAuthEnvVar: string | undefined;
  let rcPrivacyFilter: boolean | undefined;

  if (!specPath) {
    const rc = await loadConfig();
    if (rc) {
      const resolved = resolveConfig(rc, envName);
      specPath = resolved.spec;
      configBaseUrl = resolved.baseUrl;
      rcAuthType = resolved.authType;
      rcAuthToken = resolved.authToken;
      rcAuthEnvVar = resolved.authEnvVar;
      rcPrivacyFilter = resolved.privacyFilter;
    }
  }

  if (!specPath) {
    if (rawArgs.length > 0 && !rawArgs[0].startsWith("-") && rawArgs[0] !== "auth" && rawArgs[0] !== "init") {
      console.error("Error: no OpenAPI spec found.\n");
      console.error("  Either pass --spec:");
      console.error("    spec2cli --spec ./openapi.yaml " + rawArgs.join(" ") + "\n");
      console.error("  Or create a .toclirc:");
      console.error("    spec2cli init --spec ./openapi.yaml\n");
      process.exit(1);
    }
    program.parse(process.argv);
    return;
  }

  // Resolved before the spec loads so a spec failure can still honour --output.
  const output = getFlagValue(rawArgs, "--output") ?? (process.stdout.isTTY ? "pretty" : "json");

  try {
    const spec = await loadSpec(specPath, { refresh: rawArgs.includes("--refresh") });
    const groups = extractOperations(spec);

    if (rawArgs.includes("--agent-help")) {
      printAgentHelp(groups, spec, parseAgentHelpSelector(rawArgs));
      return;
    }

    const auth = await resolveAuthFromFlags(
      {
        token: getFlagValue(rawArgs, "--token"),
        apiKey: getFlagValue(rawArgs, "--api-key"),
        basic: getFlagValue(rawArgs, "--basic"),
        headers: parseHeaderArgs(rawArgs),
        profile: getFlagValue(rawArgs, "--profile"),
        rcAuthType,
        rcAuthToken,
        rcAuthEnvVar,
      },
      spec
    );

    const filterPiiEnabled = rawArgs.includes("--filter-pii") || rcPrivacyFilter === true;
    const piiFields = filterPiiEnabled && spec.components?.schemas
      ? scanSchema(spec.components.schemas as Record<string, unknown>)
      : [];

    if (filterPiiEnabled && piiFields.length > 0 && rawArgs.includes("--verbose")) {
      console.error(`[pii] detected fields: ${piiFields.join(", ")}`);
    }

    const config: RuntimeConfig = {
      specPath,
      baseUrl: getFlagValue(rawArgs, "--base-url") ?? configBaseUrl ?? resolveBaseUrl(spec, specPath),
      auth,
      output,
      maxItems: getFlagValue(rawArgs, "--max-items") ? parseInt(getFlagValue(rawArgs, "--max-items")!) : undefined,
      verbose: rawArgs.includes("--verbose"),
      quiet: rawArgs.includes("--quiet"),
      dryRun: rawArgs.includes("--dry-run"),
      revealSecrets: rawArgs.includes("--reveal"),
      validate: rawArgs.includes("--validate"),
      filterPii: filterPiiEnabled,
      piiSalt: process.env.SPEC2CLI_PII_SALT ?? "",
      piiFields,
    };

    buildDynamicCommands(program, groups, config, spec);

    const filteredArgv = filterTocliFlags(process.argv);
    program.parse(filteredArgv);
  } catch (err) {
    fail(output, { kind: "spec", message: (err as Error).message });
  }
}

main().catch((err) => {
  console.error(`Error: ${(err as Error).message}`);
  process.exit(1);
});
