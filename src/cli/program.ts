import { Command } from "commander";
import { registerAuthCommands } from "../auth/commands.js";
import { registerInitCommand } from "../config/init.js";
import { registerUseCommand } from "../templates/commands.js";
import { registerPrivacyCommands } from "../privacy/commands.js";

/** The static half of the CLI: identity, help text, and the commands that exist
 *  regardless of any spec. Operation commands are added later, from the spec. */
export function createProgram(): Command {
  const program = new Command();

  program
    .name("spec2cli")
    .description("Turn any OpenAPI spec into a CLI. No code generation, no build step.")
    .version("0.7.0")
    .addHelpText("after", HELP);

  registerAuthCommands(program);
  registerInitCommand(program);
  registerUseCommand(program);
  registerPrivacyCommands(program);

  return program;
}

const HELP = `
Commands: use | search | add | remove | privacy scan
Flags:    --dry-run | --reveal | --validate | --agent-help | --filter-pii | --header "Name: Value"

Agent help (flat for small specs, drill-down for large ones):
  spec2cli --spec ./api.yaml --agent-help                 catalog (groups only if large)
  spec2cli --spec ./api.yaml --agent-help pets            commands in a group
  spec2cli --spec ./api.yaml --agent-help pets create     parameters for one command
  spec2cli --spec ./api.yaml --agent-help --find "create" search every group
  spec2cli --spec ./api.yaml --agent-help --all           force the whole catalog
  spec2cli --spec ./api.yaml --agent-help --progressive   force the drill-down root

Exit codes: 0 ok · 2 schema · 3 missing input · 4 auth · 5 not found
            6 client · 7 rate limited · 8 server · 9 network · 10 spec

Examples:
  spec2cli --spec ./api.yaml pets list
  spec2cli --spec ./api.yaml --filter-pii customers list
  spec2cli --spec ./api.yaml --dry-run pets create --name Rex
  spec2cli use petstore pet findpetsbystatus --status available
  spec2cli add myapi --spec ./openapi.yaml --base-url http://localhost:3000`;
