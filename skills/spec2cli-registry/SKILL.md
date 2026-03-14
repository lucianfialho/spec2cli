---
name: spec2cli-registry
version: 1.0.0
description: "Use built-in API templates, search, and manage custom APIs"
metadata:
  openclaw:
    category: "tool"
    domain: "api"
    requires:
      bins: ["spec2cli"]
      skills: ["spec2cli-basics"]
---

# spec2cli — Registry

spec2cli ships with a community registry of pre-configured APIs. You can also add your own.

## List available APIs

```bash
spec2cli use --list
```

Built-in APIs: petstore, github, openai, stripe, cloudflare, digitalocean.

## Use a template

```bash
# See what commands an API has
spec2cli use petstore --help
spec2cli use petstore pet --help

# Execute commands
spec2cli use petstore pet findpetsbystatus --status available
spec2cli use github repos --help
```

Auth is auto-configured from environment variables:

```bash
GITHUB_TOKEN=ghp_xxx spec2cli use github repos list
OPENAI_API_KEY=sk-xxx spec2cli use openai models list
STRIPE_SECRET_KEY=sk-xxx spec2cli use stripe charges list
```

## Search APIs

```bash
spec2cli search payments    # finds: stripe
spec2cli search cloud       # finds: cloudflare, digitalocean
spec2cli search ai          # finds: openai
```

## Add custom APIs

```bash
# From URL
spec2cli add myapi --spec https://api.example.com/openapi.json --base-url https://api.example.com

# From local file
spec2cli add myapi --spec ./openapi.yaml --base-url http://localhost:3000

# With auth
spec2cli add myapi --spec ./api.yaml --base-url https://api.example.com --auth-type bearer --auth-env MY_API_TOKEN

# Import from a company registry
spec2cli add --from https://mycompany.com/apis.json
```

## Remove custom APIs

```bash
spec2cli remove myapi
```

## Tips

- Custom APIs are stored in `~/.config/spec2cli/apis.json`
- Custom APIs override registry APIs if same name
- Custom APIs show `[local]` tag in `spec2cli use --list`
- The registry is cached locally for 1 hour
