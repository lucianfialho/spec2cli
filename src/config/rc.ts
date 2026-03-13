import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { parse as parseYaml } from "yaml";

export interface RcConfig {
  spec: string;
  baseUrl?: string;
  auth?: {
    type?: string;
    envVar?: string;
  };
  environments?: Record<string, {
    baseUrl?: string;
    auth?: {
      type?: string;
      envVar?: string;
    };
  }>;
}

const RC_FILENAME = ".mcp-crc";

export async function loadConfig(startDir?: string): Promise<RcConfig | null> {
  const rcPath = await findRcFile(startDir ?? process.cwd());
  if (!rcPath) return null;

  const raw = await readFile(rcPath, "utf-8");
  const config = parseYaml(raw) as RcConfig;

  if (!config.spec) {
    throw new Error(`.mcp-crc found at ${rcPath} but missing 'spec' field.`);
  }

  return config;
}

export function resolveConfig(config: RcConfig, envName?: string): { spec: string; baseUrl?: string; authEnvVar?: string } {
  let spec = config.spec;
  let baseUrl = config.baseUrl;
  let authEnvVar = config.auth?.envVar;

  if (envName && config.environments?.[envName]) {
    const env = config.environments[envName];
    if (env.baseUrl) baseUrl = env.baseUrl;
    if (env.auth?.envVar) authEnvVar = env.auth.envVar;
  }

  // Resolve env vars in values
  spec = resolveEnvVars(spec);
  if (baseUrl) baseUrl = resolveEnvVars(baseUrl);

  return { spec, baseUrl, authEnvVar };
}

async function findRcFile(dir: string): Promise<string | null> {
  let current = dir;
  const root = dirname(current) === current ? current : "/";

  while (true) {
    const candidate = join(current, RC_FILENAME);
    try {
      await readFile(candidate, "utf-8");
      return candidate;
    } catch {
      // Not found, go up
    }

    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function resolveEnvVars(value: string): string {
  return value.replace(/\$\{([^}]+)\}|\$([A-Z_][A-Z0-9_]*)/g, (_, braced, plain) => {
    const name = braced ?? plain;
    return process.env[name] ?? "";
  });
}
