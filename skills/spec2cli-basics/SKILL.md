---
name: spec2cli-basics
version: 1.0.0
description: "Core spec2cli usage: load specs, run commands, format output"
metadata:
  openclaw:
    category: "tool"
    domain: "api"
    requires:
      bins: ["spec2cli"]
      skills: []
    cliHelp: "spec2cli --help"
---

# spec2cli — Basics

spec2cli turns any OpenAPI/Swagger spec into a working CLI. No code generation.

## Loading a spec

```bash
# Local file (YAML or JSON)
spec2cli --spec ./openapi.yaml <group> <command>

# Remote URL
spec2cli --spec https://api.example.com/openapi.json <group> <command>

# Swagger 2.0 is auto-converted
spec2cli --spec ./swagger2.json <group> <command>
```

## Discovering commands

```bash
# Human-readable help
spec2cli --spec ./api.yaml --help
spec2cli --spec ./api.yaml pets --help
spec2cli --spec ./api.yaml pets create --help

# AI-optimized: compact YAML with all commands, params, types
spec2cli --spec ./api.yaml --agent-help
```

**Always start with `--agent-help`** — it returns everything you need in one call.

## Running commands

Commands follow the pattern: `spec2cli --spec <spec> <group> <command> [--flags]`

```bash
spec2cli --spec api.yaml pets list
spec2cli --spec api.yaml pets list --status available --limit 5
spec2cli --spec api.yaml pets get --petId 1
spec2cli --spec api.yaml pets create --name Rex --tag dog
```

## Output formats

| Flag | Format | Best for |
|---|---|---|
| `--output json` | Compact JSON, one line | Piping, scripts |
| `--output pretty` | Colorized indented JSON | Human reading (default in TTY) |
| `--output table` | Aligned columns | Scanning lists |
| `--output yaml` | YAML | Config files, readability |
| `--quiet` | No output, just exit code | Conditional scripts |
| `--max-items N` | Limit array results | Large responses |

```bash
spec2cli --spec api.yaml --output json pets list
spec2cli --spec api.yaml --output table pets list
spec2cli --spec api.yaml --output yaml pets get --petId 1
spec2cli --spec api.yaml --max-items 5 pets list
```

## Verbose mode

Show the HTTP request and response for debugging:

```bash
spec2cli --spec api.yaml --verbose pets get --petId 1
# → GET https://api.example.com/pets/1
#   Accept: application/json
# ← 200 OK
```

## Project config

Skip `--spec` by creating a `.toclirc`:

```bash
spec2cli init --spec ./openapi.yaml --base-url https://api.example.com
# Now just: spec2cli pets list
```

## Tips

- Use `--output json` when piping to `jq`
- Use `--agent-help` before anything else — one call gives you the full API surface
- Required params are enforced — the CLI errors before making the request
- Swagger 2.0 and OpenAPI 3.x both work transparently
