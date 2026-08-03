# Changelog

## 0.9.0

### Fixed

**A spec with colliding operation names killed the CLI.** Two operationIds that
simplify to the same command — `searchItems` and `searchItem` under one tag —
made Commander throw while the command tree was built, before any command ran.
Every invocation failed, `--help` included, so there was no way to even see what
went wrong. Colliding names are now disambiguated by HTTP method. (#31, #23)

**`--dry-run` printed credentials in the clear**, including inside the
copy-pasteable curl — the output people paste into bug reports. Masked by
default now; `--reveal` opts back in. The preview had also silently stopped
including the spec's header parameters. (#29)

**Array parameters were sent as strings.** `--tags '["a","b"]'` reached the
server quoted, because the type check looked for `array` while the extractor
names arrays after their items (`string[]`). (#32)

**Parameters sharing a name across locations** produced two flags of the same
name, which Commander rejects. `id` in the path plus `id` in the query now
resolves to one, first declaration winning. (#31)

**Parameter names that are not valid flags** — `filter[name]` — are offered as
`--filter-name` while the request still goes out under the spec's own name. (#31)

**Refs into `paths` never resolved.** JSON Pointer escapes (`~1` for `/`, RFC
6901) were not decoded, so `#/paths/~1pets/parameters/0` silently missed. (#31)

### Added

**Exit codes by failure kind.** Everything used to exit `1`, so a missing flag, a
rate limit and an unreachable host were indistinguishable and nothing could
decide whether retrying was worth anything.

| code | kind | retryable |
|---|---|---|
| 2 | schema validation | no |
| 3 | missing required input | no |
| 4 | auth (401, 403) | no |
| 5 | not found (404) | no |
| 6 | other client error | no |
| 7 | rate limited (429) | yes |
| 8 | server error (5xx) | yes |
| 9 | network | yes |
| 10 | spec could not be loaded | no |

**`--output json` is honoured on failure**, emitted as data on stdout — for a
caller that asked for machine-readable output, a failure is still a result.
Missing inputs report *every* missing parameter at once, with the schema needed
to fill them in and call again.

**`spec2cli privacy scan <spec>`** reports the fields `--filter-pii` would
redact, grouped by schema, and which operations return them. (#22)

**`--refresh`** forces a cache check. There was previously no way to bust it.

**`--progressive`** forces the drill-down form of `--agent-help`; `--all` forces
the flat catalog.

### Changed

**Cached specs are revalidated rather than re-downloaded.** Past the one-hour
TTL, spec2cli asks the server whether the spec changed using the `ETag` or
`Last-Modified` it sent originally. On GitHub's own 12.9 MB description that is
0.25s instead of 2.62s, and the content is *confirmed* current rather than
assumed. A server that cannot be reached now falls back to the cached copy with
a warning instead of failing the command. (#30)

**`--agent-help` adapts to the spec size.** It hands over the flat catalog below
400 operations and drills down above it. Measured against a real agent loop,
progressive disclosure costs more than it saves on ordinary specs: each
drill-down is a round trip and every round trip resends the whole conversation.
See `bench/` for the numbers and the crossover. (#29)

**`--version` reads from package.json**, having drifted two releases behind.

### Removed

`src/executor/commander-builder.ts`, dead on the runtime path and duplicating
command building. It had already drifted from the live path — the same shape of
divergence that let `--dry-run` leak credentials.

### Notes for upgrading

Exit codes are a public contract and this release changes them. Anything
branching on `exit 1` should be reviewed; failures that used to be `1` are now
`3` through `10`.

`--agent-help` with no argument returns a different shape depending on the size
of the spec. `--all` restores the previous behaviour unconditionally.

## 0.8.0

Sanitize OpenAPI tag names for Commander compatibility. (#28)
