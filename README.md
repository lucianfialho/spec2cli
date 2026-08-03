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

### Remote spec caching

Specs fetched over HTTP are cached for an hour. Past that, spec2cli asks the
server whether the spec changed instead of downloading it again — using the
`ETag` or `Last-Modified` the server sent with the original response.

On GitHub's own OpenAPI description (12.9 MB):

| | |
|---|---|
| first fetch | 2.62s |
| within the hour, no network | 0.17s |
| after the hour, revalidated with a 304 | **0.25s** (was 2.62s) |

A confirmed 304 also restarts the hour, so the following calls skip the network
entirely. Servers that send no validator fall back to a full refetch.

```bash
spec2cli --spec https://example.com/api.json --refresh pets list  # force a check
```

If the server cannot be reached and a cached copy exists, the cached spec is
used and a warning goes to stderr, rather than failing a command over a spec you
already have.

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
