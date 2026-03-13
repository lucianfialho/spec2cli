import type { OpenAPISpec } from "../parser/types.js";
import type { AuthConfig } from "./types.js";
import { getProfile } from "./config.js";

export interface AuthFlags {
  token?: string;
  apiKey?: string;
  authHeader?: string;
  profile?: string;
}

export async function resolveAuth(
  flags: AuthFlags,
  spec: OpenAPISpec,
  env: NodeJS.ProcessEnv = process.env
): Promise<AuthConfig> {
  // Priority 1: Inline flags
  if (flags.token) {
    return { type: "bearer", value: resolveEnvVar(flags.token, env) };
  }
  if (flags.apiKey) {
    const headerName = detectApiKeyHeader(spec) ?? "X-API-Key";
    return { type: "apiKey", value: resolveEnvVar(flags.apiKey, env), headerName };
  }
  if (flags.authHeader) {
    return { type: "bearer", value: resolveEnvVar(flags.authHeader, env) };
  }

  // Priority 2: Environment variables from spec
  const specAuth = detectAuthFromSpec(spec);
  if (specAuth) {
    // Check common env var names
    const envVarNames = ["API_TOKEN", "API_KEY", "AUTH_TOKEN", "BEARER_TOKEN"];
    for (const name of envVarNames) {
      if (env[name]) {
        return { ...specAuth, value: env[name]! };
      }
    }
  }

  // Priority 3: Saved profile
  const profileName = flags.profile ?? "default";
  const profile = await getProfile(profileName);
  if (profile) {
    return {
      type: profile.type,
      value: resolveEnvVar(profile.value, env),
      headerName: profile.headerName,
    };
  }

  return { type: "none", value: "" };
}

function detectAuthFromSpec(spec: OpenAPISpec): Omit<AuthConfig, "value"> | null {
  const schemes = spec.components?.securitySchemes;
  if (!schemes) return null;

  for (const scheme of Object.values(schemes)) {
    if (scheme.type === "http" && scheme.scheme === "bearer") {
      return { type: "bearer" };
    }
    if (scheme.type === "apiKey" && scheme.in === "header") {
      return { type: "apiKey", headerName: scheme.name };
    }
    if (scheme.type === "http" && scheme.scheme === "basic") {
      return { type: "basic" };
    }
  }

  return null;
}

function detectApiKeyHeader(spec: OpenAPISpec): string | undefined {
  const schemes = spec.components?.securitySchemes;
  if (!schemes) return undefined;

  for (const scheme of Object.values(schemes)) {
    if (scheme.type === "apiKey" && scheme.in === "header") {
      return scheme.name;
    }
  }

  return undefined;
}

function resolveEnvVar(value: string, env: NodeJS.ProcessEnv): string {
  // Replace $VAR or ${VAR} with env values
  return value.replace(/\$\{([^}]+)\}|\$([A-Z_][A-Z0-9_]*)/g, (_, braced, plain) => {
    const name = braced ?? plain;
    return env[name] ?? "";
  });
}
