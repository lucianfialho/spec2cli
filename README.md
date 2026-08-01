# spec2cli

**Turn any OpenAPI spec into a CLI. No code generation, no build step.**

<p align="center">
  <img src="demo/demo.gif" alt="spec2cli demo" width="800">
</p>

```bash
npx spec2cli --spec ./api.yaml pets list --status available
npx spec2cli --spec ./api.yaml pets create --name Rex --token sk-123
```

spec2cli reads OpenAPI 3.x and Swagger 2.0 specs at runtime and dynamically generates a fully functional CLI with commands, flags, auth, and formatted output.

## Quick start

```bash
# Try it with any OpenAPI spec
npx spec2cli --spec https://petstore3.swagger.io/api/v3/openapi.json pets --help

# Or install globally
npm install -g spec2cli
```

## How it works

```
OpenAPI 3.x spec (YAML or JSON)
         │
         ▼
┌─────────────────┐     ┌──────────────┐     ┌─────────────────┐
│  Parser          │────▶│  Commander   │────▶│  Output         │
│  (reads spec,    │     │  (dynamic    │     │  (json, pretty, │
│   extracts ops)  │     │   commands)  │     │   table, quiet) │
└─────────────────┘     └──────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌──────────────┐
                        │  HTTP        │
                        │  Executor    │
                        └──────────────┘
```

- Each **tag** in the spec becomes a command group (`pets`, `store`)
- Each **operation** becomes a subcommand (`list`, `create`, `get`)
- **Path params** become required flags (`--petId 123`)
- **Query params** become optional flags (`--limit 10`)
- **Request body** fields become flags (`--name Rex --tag dog`)
- **Auth** is detected from `securitySchemes`

## Usage

### Commands from spec

```bash
# List
spec2cli --spec api.yaml pets list
spec2cli --spec api.yaml pets list --status available --limit 5

# Create
spec2cli --spec api.yaml --token sk-123 pets create --name Rex --tag dog

# Get by ID
spec2cli --spec api.yaml pets get --petId 1

# Update
spec2cli --spec api.yaml --token sk-123 pets update --petId 1 --status sold

# Delete
spec2cli --spec api.yaml --token sk-123 pets delete --petId 1
```

### Output formats

```bash
spec2cli --spec api.yaml --output json pets list      # compact JSON (pipe-friendly)
spec2cli --spec api.yaml --output pretty pets list     # colorized JSON (default in TTY)
spec2cli --spec api.yaml --output table pets list      # aligned columns
spec2cli --spec api.yaml --quiet pets create --name X  # no output, just exit code
spec2cli --spec api.yaml --max-items 3 pets list       # limit results
```

### Authentication

```bash
# Inline flags (auto-detected from spec securitySchemes)
spec2cli --spec api.yaml --token sk-123 pets create --name Rex
spec2cli --spec api.yaml --api-key my-key store inventory

# Persistent profiles
spec2cli auth login --token sk-prod-key
spec2cli auth login --api-key staging-key --profile staging
spec2cli auth status
spec2cli auth logout
```

### Project config

```bash
# Initialize config in your project
spec2cli init --spec ./openapi.yaml --base-url https://api.example.com
```

Creates a `.toclirc` file:

```yaml
spec: ./openapi.yaml
baseUrl: https://api.example.com
auth:
  type: bearer
  envVar: API_TOKEN
environments:
  staging:
    baseUrl: https://staging.example.com
    auth:
      envVar: STAGING_API_TOKEN
```

Now you can skip `--spec`:

```bash
spec2cli pets list
spec2cli --env staging pets list
```

### Dynamic help

spec2cli generates help automatically from the spec:

```bash
spec2cli --spec api.yaml --help           # shows all command groups
spec2cli --spec api.yaml pets --help      # shows subcommands
spec2cli --spec api.yaml pets create --help  # shows flags with types
```

### Errors and exit codes

Every failure kind gets its own exit code, so a caller can tell a missing flag
from a rate limit from an unreachable host — and decide whether retrying is
worth anything.

| code | kind | retryable |
|---|---|---|
| 0 | success | — |
| 2 | schema validation failed | no |
| 3 | missing required input | no |
| 4 | auth (401, 403) | no |
| 5 | not found (404) | no |
| 6 | other client error (4xx) | no |
| 7 | rate limited (429) | **yes** |
| 8 | server error (5xx) | **yes** |
| 9 | network / unreachable | **yes** |
| 10 | spec could not be loaded | no |

Under `--output json` the failure is emitted as data on stdout rather than prose
on stderr, because for a caller that asked for JSON a failure is still a result:

```json
{ "error": { "kind": "rate_limited", "message": "429 ...",
             "retryable": true, "exit_code": 7, "status": 429 } }
```

Missing inputs report **every** missing parameter at once, with enough schema to
fill them in and call again:

```json
{ "status": "input_required", "command": "pets create",
  "missing": [{ "name": "name", "type": "string", "in": "body" }],
  "exit_code": 3 }
```

### Agent help

`--agent-help` emits a machine-readable catalog for an LLM agent driving the CLI.
It is served progressively: a spec with 1000 operations costs ~84k tokens to dump
in full, so the root level lists groups only and the agent pays for detail just
where it decided to act.

```bash
spec2cli --spec api.yaml --agent-help                  # groups and counts (~300 tokens)
spec2cli --spec api.yaml --agent-help pets             # command names in one group
spec2cli --spec api.yaml --agent-help pets create      # full parameters for one command
spec2cli --spec api.yaml --agent-help --find "create"  # search across every group
spec2cli --spec api.yaml --agent-help --all            # everything at once
```

Walking root → group → command costs ~1.1k tokens on that same 1000-operation
spec, against ~84k for `--all`. Because only one command is expanded at a time,
the detail level carries full descriptions — including parameter semantics that
live in prose rather than in the schema.

### Dry run

`--dry-run` prints the request an operation would send, including a
copy-pasteable curl. **Credentials are masked** — this output is what people
paste into bug reports:

```bash
spec2cli --spec api.yaml --dry-run pets get --petId 1
# Authorization: Bearer sk-s...3456
# curl -X GET 'https://api.example.com/pets/1' \
#   -H 'Authorization: Bearer sk-s...3456'
```

Pass `--reveal` to emit them literally, and `--output json` to get the request
as structured data instead of prose.

### Debug

```bash
spec2cli --spec api.yaml --verbose pets get --petId 1
# → GET https://api.example.com/pets/1
#   Accept: application/json
# ← 200 OK
```

## Features

- Reads OpenAPI 3.x (YAML or JSON) from local files or URLs
- Dynamic CLI generation at runtime (no code-gen, no build step)
- All output formats: json, pretty (colorized), table, quiet
- Auth: Bearer token, API key, with persistent profiles
- Project config (`.toclirc`) with multiple environments
- Verbose mode for debugging requests
- Works with `npx` (zero install)

## Development

```bash
git clone https://github.com/lucianfialho/spec2cli
cd spec2cli
npm install
npm run build
npm test
```

## License

MIT
