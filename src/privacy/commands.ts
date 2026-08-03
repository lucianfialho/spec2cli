import type { Command } from "commander";
import { loadSpec } from "../parser/loader.js";
import { scanSpecForPii, groupBySchema, operationsExposing } from "./scan.js";
import { fail } from "../cli/errors.js";

export function registerPrivacyCommands(program: Command): void {
  const privacy = program.command("privacy").description("Inspect what --filter-pii would redact");

  privacy
    .command("scan")
    .description("Report the fields --filter-pii would redact in a spec")
    .argument("[spec]", "Path or URL to the OpenAPI spec")
    .option("--spec <path>", "Path or URL to the OpenAPI spec")
    .option("--output <format>", "json for machine-readable output")
    .action(async (positional: string | undefined, opts: Record<string, string>) => {
      const source = positional ?? opts["spec"];
      const output = opts["output"] ?? (process.stdout.isTTY ? "pretty" : "json");

      if (!source) {
        fail(output, { kind: "usage", message: "privacy scan needs a spec: spec2cli privacy scan ./api.yaml" });
      }

      let spec;
      try {
        spec = await loadSpec(source);
      } catch (err) {
        fail(output, { kind: "spec", message: (err as Error).message });
      }

      const findings = scanSpecForPii(spec);
      const grouped = groupBySchema(findings);
      const exposed = operationsExposing(spec, new Set(grouped.keys()));

      if (output === "json") {
        console.log(
          JSON.stringify(
            {
              api: spec.info.title,
              fields: findings.map((f) => f.path),
              schemas: Object.fromEntries(grouped),
              operations_returning_them: exposed,
            },
            null,
            2
          )
        );
        return;
      }

      console.log(`${spec.info.title}\n`);

      if (findings.length === 0) {
        console.log("No fields matched. --filter-pii would redact nothing here.");
        console.log("Detection is by field name and format, so anything named unusually is missed.");
        return;
      }

      console.log(`${findings.length} field${findings.length === 1 ? "" : "s"} would be redacted:\n`);
      for (const [schema, fields] of grouped) {
        console.log(`  ${schema}`);
        for (const field of fields) console.log(`    ${field}`);
      }

      if (exposed.length > 0) {
        console.log(`\nReturned by:`);
        for (const op of exposed.slice(0, 12)) console.log(`  ${op}`);
        if (exposed.length > 12) console.log(`  ... and ${exposed.length - 12} more`);
      }

      console.log(`\nRun with --filter-pii to redact them, or set privacyFilter: true in .toclirc.`);
    });
}
