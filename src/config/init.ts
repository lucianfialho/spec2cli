import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { stringify as toYaml } from "yaml";
import type { Command } from "commander";

export function registerInitCommand(program: Command): void {
  program
    .command("init")
    .description("Create a .toclirc config file in the current directory")
    .option("--spec <path>", "Path or URL to OpenAPI spec")
    .option("--base-url <url>", "Base URL for API")
    .action(async (opts: Record<string, string>) => {
      const specPath = opts["spec"] ?? "./openapi.yaml";
      const config: Record<string, unknown> = {
        spec: specPath,
      };

      if (opts["baseUrl"]) {
        config["baseUrl"] = opts["baseUrl"];
      }

      config["auth"] = {
        type: "bearer",
        envVar: "API_TOKEN",
      };

      config["environments"] = {
        staging: {
          baseUrl: "https://staging.example.com",
          auth: { envVar: "STAGING_API_TOKEN" },
        },
      };

      const rcPath = join(process.cwd(), ".toclirc");
      const yaml = toYaml(config);
      await writeFile(rcPath, yaml, "utf-8");
      console.log(`Created ${rcPath}`);
      console.log("Edit the file to configure your API spec and auth.");
    });
}
