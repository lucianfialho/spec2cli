import type { Command } from "commander";
import { saveProfile, removeProfile, getProfile, loadAuthStore, maskToken } from "./config.js";

export function registerAuthCommands(program: Command): void {
  const auth = program.command("auth").description("Manage authentication");

  auth
    .command("login")
    .description("Save auth credentials")
    .option("--token <token>", "Bearer token")
    .option("--api-key <key>", "API key")
    .option("--header-name <name>", "Custom header name for API key", "X-API-Key")
    .option("--profile <name>", "Profile name", "default")
    .action(async (opts: Record<string, string>) => {
      const profileName = opts["profile"] ?? "default";

      if (opts["token"]) {
        await saveProfile(profileName, { type: "bearer", value: opts["token"] });
        console.log(`Saved bearer token to profile '${profileName}'.`);
      } else if (opts["apiKey"]) {
        await saveProfile(profileName, {
          type: "apiKey",
          value: opts["apiKey"],
          headerName: opts["headerName"] ?? "X-API-Key",
        });
        console.log(`Saved API key to profile '${profileName}'.`);
      } else {
        console.error("Error: provide --token or --api-key");
        process.exit(1);
      }
    });

  auth
    .command("logout")
    .description("Remove saved credentials")
    .option("--profile <name>", "Profile name", "default")
    .action(async (opts: Record<string, string>) => {
      const profileName = opts["profile"] ?? "default";
      const removed = await removeProfile(profileName);
      if (removed) {
        console.log(`Removed credentials for profile '${profileName}'.`);
      } else {
        console.log(`No credentials found for profile '${profileName}'.`);
      }
    });

  auth
    .command("status")
    .description("Show current auth info")
    .option("--profile <name>", "Profile name")
    .action(async (opts: Record<string, string>) => {
      const store = await loadAuthStore();
      const profiles = Object.keys(store.profiles);

      if (profiles.length === 0) {
        console.log("No saved credentials.");
        return;
      }

      if (opts["profile"]) {
        const profile = store.profiles[opts["profile"]];
        if (!profile) {
          console.log(`No credentials for profile '${opts["profile"]}'.`);
          return;
        }
        printProfile(opts["profile"], profile);
      } else {
        for (const name of profiles) {
          printProfile(name, store.profiles[name]);
        }
      }
    });
}

function printProfile(name: string, profile: { type: string; value: string; headerName?: string }): void {
  const masked = maskToken(profile.value);
  console.log(`Profile: ${name}`);
  console.log(`  Type:   ${profile.type}`);
  console.log(`  Value:  ${masked}`);
  if (profile.headerName) {
    console.log(`  Header: ${profile.headerName}`);
  }
}
