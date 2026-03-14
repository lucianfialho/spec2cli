---
name: spec2cli-auth
version: 1.0.0
description: "Configure authentication: inline flags, env vars, persistent profiles"
metadata:
  openclaw:
    category: "tool"
    domain: "api"
    requires:
      bins: ["spec2cli"]
      skills: ["spec2cli-basics"]
---

# spec2cli — Authentication

spec2cli detects auth requirements from the OpenAPI spec and supports multiple auth methods.

## Inline flags (highest priority)

```bash
# Bearer token
spec2cli --spec api.yaml --token sk-123 pets create --name Rex

# API key
spec2cli --spec api.yaml --api-key my-key store inventory
```

## Environment variables

Set the env var and spec2cli picks it up automatically:

```bash
export API_TOKEN=sk-123
spec2cli --spec api.yaml pets create --name Rex
```

For registry templates, each API has a specific env var:

| API | Env var |
|---|---|
| github | `GITHUB_TOKEN` |
| openai | `OPENAI_API_KEY` |
| stripe | `STRIPE_SECRET_KEY` |
| cloudflare | `CLOUDFLARE_API_TOKEN` |
| digitalocean | `DIGITALOCEAN_TOKEN` |

## Persistent profiles

Save credentials locally so you don't need flags or env vars:

```bash
# Save default profile
spec2cli auth login --token sk-prod-key

# Save named profile
spec2cli auth login --api-key staging-key --profile staging

# Check what's saved
spec2cli auth status

# Remove
spec2cli auth logout
spec2cli auth logout --profile staging
```

Profiles are stored in `~/.config/spec2cli/auth.json`. Tokens are masked in `auth status` output.

## Priority order

1. Inline flags (`--token`, `--api-key`)
2. Environment variables (`$API_TOKEN`, `$GITHUB_TOKEN`, etc.)
3. Saved profile (from `spec2cli auth login`)

## Tips

- Use `--agent-help` to see what auth each command needs
- Auth type is auto-detected from the spec's `securitySchemes`
- Use `--profile` to switch between production and staging
