import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import type { AuthStore, AuthProfile } from "./types.js";

function getConfigDir(): string {
  const xdg = process.env["XDG_CONFIG_HOME"];
  return join(xdg ?? join(homedir(), ".config"), "mcp-c");
}

function getConfigPath(): string {
  return join(getConfigDir(), "auth.json");
}

export async function loadAuthStore(): Promise<AuthStore> {
  try {
    const raw = await readFile(getConfigPath(), "utf-8");
    return JSON.parse(raw) as AuthStore;
  } catch {
    return { profiles: {} };
  }
}

export async function saveAuthStore(store: AuthStore): Promise<void> {
  const dir = getConfigDir();
  await mkdir(dir, { recursive: true });
  await writeFile(getConfigPath(), JSON.stringify(store, null, 2), "utf-8");
}

export async function saveProfile(name: string, profile: AuthProfile): Promise<void> {
  const store = await loadAuthStore();
  store.profiles[name] = profile;
  await saveAuthStore(store);
}

export async function removeProfile(name: string): Promise<boolean> {
  const store = await loadAuthStore();
  if (!store.profiles[name]) return false;
  delete store.profiles[name];
  await saveAuthStore(store);
  return true;
}

export async function getProfile(name: string): Promise<AuthProfile | undefined> {
  const store = await loadAuthStore();
  return store.profiles[name];
}

export function maskToken(value: string): string {
  if (value.length <= 8) return "****";
  return value.slice(0, 4) + "..." + value.slice(-4);
}
