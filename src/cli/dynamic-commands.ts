import type { Command } from "commander";
import { executeRequest } from "../executor/http.js";
import { formatOutput } from "../output/formatters.js";
import { validateResponse } from "../validator/schema.js";
import { filterPii } from "@lucianfialho/pii-filter";
import { printDryRun } from "./dry-run.js";
import { commandNamesForGroup } from "./command-names.js";
import { flagNameForParam, optionValueForParam } from "./options.js";
import { sanitizeCommandName, uniqueName } from "./sanitize.js";
import { EXIT, classifyStatus, classifyThrown, fail, failMissingInput } from "./errors.js";
import type { RuntimeConfig } from "../executor/types.js";
import type { OperationGroup, OpenAPISpec } from "../parser/types.js";

export function buildDynamicCommands(
  prog: Command,
  groups: OperationGroup[],
  config: RuntimeConfig,
  spec?: OpenAPISpec
): void {
  const usedNames = new Set<string>();
  for (const group of groups) {
    const groupName = uniqueName(sanitizeCommandName(group.tag), usedNames);
    const groupCmd = prog.command(groupName).description(group.description);

    const cmdNames = commandNamesForGroup(group);

    for (const [index, op] of group.operations.entries()) {
      const cmd = groupCmd.command(cmdNames[index]).description(op.summary || op.description);

      for (const p of op.params) {
        // A spec parameter is free to be named `filter[name]`; a flag is not.
        const flagName = flagNameForParam(p.name);
        const flag = `--${flagName} <${flagName}>`;
        const desc = p.description || p.name;
        // Required params are declared optional to Commander and checked in the
        // action instead, so a caller learns about every missing input at once
        // rather than one per failed invocation.
        if (p.required) {
          cmd.option(flag, `${desc} (required)`);
        } else if (p.default !== undefined) {
          cmd.option(flag, desc, String(p.default));
        } else {
          cmd.option(flag, desc);
        }
      }

      cmd.action(async (opts: Record<string, unknown>) => {
        // Required params are read back under their sanitized flag name too,
        // or one named `filter[name]` would always look absent.
        const missing = op.params.filter(
          (p) => p.required && optionValueForParam(opts, p.name) === undefined
        );
        if (missing.length > 0) {
          failMissingInput(config.output, `${groupName} ${cmdNames[index]}`, missing);
        }

        const params: Record<string, unknown> = {};
        for (const p of op.params) {
          // Read back under the sanitized name, since that is what Commander
          // stored it as — the request still goes out under the spec's name.
          const value = optionValueForParam(opts, p.name);
          if (value === undefined) continue;
          if (p.type === "integer" || p.type === "number") {
            params[p.name] = Number(value);
          } else if (p.type === "boolean") {
            params[p.name] = value === true || value === "true";
          } else if ((p.type === "object" || p.type === "array") && typeof value === "string") {
            try {
              params[p.name] = JSON.parse(value);
            } catch {
              params[p.name] = value;
            }
          } else {
            params[p.name] = value;
          }
        }

        if (config.dryRun) {
          printDryRun(op, params, config);
          return;
        }

        try {
          const result = await executeRequest(op, params, config.auth, config.baseUrl, config.verbose);

          if (result.status >= 400) {
            const kind = classifyStatus(result.status);
            if (config.quiet) process.exit(EXIT[kind]);
            fail(config.output, {
              kind,
              message: `${result.status} ${JSON.stringify(result.data)}`,
              status: result.status,
              body: result.data,
            });
          }

          if (config.quiet) process.exit(EXIT.ok);

          let responseData = result.data;
          if (config.filterPii && responseData !== null && typeof responseData === "object") {
            const piiOptions = config.piiSalt
              ? { mode: "pseudonymize" as const, salt: config.piiSalt, knownPiiFields: config.piiFields }
              : { mode: "redact" as const, knownPiiFields: config.piiFields };
            responseData = filterPii(responseData as Record<string, unknown>, piiOptions);
          }

          const formatted = formatOutput(responseData, {
            format: config.output as "json" | "pretty" | "table" | "yaml" | "quiet",
            maxItems: config.maxItems,
          });
          if (formatted) console.log(formatted);

          if (config.validate && spec) {
            const validation = validateResponse(responseData, op.path, op.method, result.status, spec);
            console.error("");
            if (validation.valid) {
              console.error(`\x1b[32m✓\x1b[0m Response matches schema (${validation.fieldsChecked} fields checked)`);
            } else {
              console.error(`\x1b[31m✗\x1b[0m Schema validation failed (${validation.errors.length} error${validation.errors.length > 1 ? "s" : ""}):\n`);
              for (const err of validation.errors) {
                console.error(`  ${err.path}: expected ${err.expected}, got ${err.got}`);
              }
              process.exit(EXIT.validation);
            }
          }
        } catch (err) {
          fail(config.output, {
            kind: classifyThrown(err),
            message: `Request failed: ${(err as Error).message}`,
          });
        }
      });
    }
  }
}
