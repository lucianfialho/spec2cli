# bench — context cost of spec2cli vs MCP

Internal validation of one question: **does driving an API through a CLI cost an
agent fewer tokens than driving it through MCP, and by how much?**

Scope is deliberately small — 3 servers, token footprint only. No task success
rates, no judges, no agent loop, no API spend. Turn counts are phase B and are
not measured here.

## Method

The comparison must be apples-to-apples or it proves nothing. So both arms are
fed **the same tools**: an MCP server's `tools/list` is converted mechanically
into an OpenAPI spec (each tool becomes `POST /tools/{name}` with the tool's
`inputSchema` as the request body), and spec2cli reads that. Same tools, same
schemas, same descriptions — only the access layer differs.

Servers are taken from [MCP-Bench](https://github.com/Accenture/mcp-bench), the
harness used by [Felendler et al., *From Tool Orchestration to Code Execution*
(arXiv:2602.15945)](https://arxiv.org/pdf/2602.15945), so results stay
comparable to published work.

Tokens are counted with `tiktoken` (`o200k_base`), not estimated from bytes.

## Servers

| server | tools | why |
|---|---|---|
| `math-mcp` | 13 | pure computation, no network, fully deterministic |
| `metmuseum-mcp` | 3 | thin wrapper over a real public REST API |
| `mcp-nixos` | 18 | rich docstrings — exposes the fidelity question below |

## Running

```bash
npm run build
pip install tiktoken

python3 bench/harness/footprint.py    # static footprint, per server
python3 bench/harness/drilldown.py    # end-to-end cost of a realistic task
```

Regenerating the inputs (needs the MCP servers built under `mcp-bench/mcp_servers/`):

```bash
OUT=bench/dumps/math.json node bench/harness/mcp-dump.mjs <server-cwd> node build/index.js
node bench/harness/mcp2openapi.mjs bench/dumps/math.json bench/specs/math.json math
node bench/harness/gen-spec.mjs 500 25 bench/specs/large.json   # synthetic, for scaling
```

## Results

Static footprint, 34 tools across 3 servers:

| | tokens | vs MCP |
|---|---|---|
| MCP tool definitions | 4,503 | — |
| spec2cli `--all` | 1,894 | 2.38x smaller |
| spec2cli `--all`, lossless-adjusted | 2,911 | **1.55x smaller** |
| spec2cli root (progressive) | 488 | 9.23x smaller |

End-to-end, 3 servers connected, task touches one:

| target | commands used | MCP | spec2cli | ratio |
|---|---|---|---|---|
| nixos | 2 | 4,503 | 1,246 | 3.61x |
| math | 2 | 4,503 | 879 | 5.12x |
| met | 1 | 4,503 | 1,013 | 4.45x |

Scaling, synthetic spec with 1000 operations across 25 groups:

| | tokens |
|---|---|
| flat dump (`--all`) | 83,716 |
| progressive path (root + group + one command) | 1,089 |
| | **76.9x smaller** |

## Phase B — turns, with a real agent loop

Phase A measured what each access layer costs *before* any work happens. Phase B
runs the work. Same agent (`claude -p`), same model, same tasks, three arms:

| arm | how the agent reaches the tools |
|---|---|
| `mcp` | the three MCP servers, over the protocol |
| `cli-flat` | spec2cli, whole catalog handed over upfront |
| `cli` | spec2cli, progressive `--agent-help` |

Three tasks, all nine runs produced the correct answer:

| task | MCP | spec2cli `--all` | spec2cli progressive |
|---|---|---|---|
| math-chain | 4t / 134k | 3t / 110k | 6t / 218k |
| nixos-lookup | 3t / 100k | 2t / 71k | 5t / 180k |
| cross-server | 5t / 105k | 7t / 238k | 8t / 182k |
| **TOTAL** | **12t / 341k** | 12t / 419k | 19t / 580k |

**Progressive disclosure lost.** It cost 7 extra turns and 161k more tokens than
simply handing over the catalog.

## Why Phase A was misleading

Phase A measured the upfront payload and stopped there. But discovery is not
free: each drill-down is a round trip, and **every round trip resends the entire
conversation**. Measured across these runs that is ~31k tokens per turn.

So progressive disclosure saves `flat_catalog − 1.1k` tokens and spends
~73k per extra discovery step. At 34 tools it saves 0.8k to spend 73k.

| operations | flat catalog | progressive path | cheaper |
|---|---|---|---|
| 34 | 1,894 | 1,100 | flat |
| 250 | 21,000 | 1,100 | flat |
| 500 | 42,000 | 1,100 | flat |
| 1,000 | 84,000 | 1,100 | **progressive** |
| 4,000 | 336,000 | 1,100 | **progressive** |

**The crossover in this harness is ~880 operations.** A leaner agent resends less
per turn and crosses over far sooner; a heavier one, later. The crossover is a
property of the *agent*, not of spec2cli — which is why `--agent-help` defaults
to flat below 400 operations and drills down above it, with `--all` and
`--progressive` to force either.

The 76.9x in the scaling table above is real but only reachable above that
crossover. Below it, progressive disclosure is a pessimisation.

## A harness caveat that matters

This Claude Code build **defers MCP tool schemas** — they are named upfront but
loaded on demand via `ToolSearch`. So the MCP arm is not classic flat injection;
it gets a form of progressive disclosure of its own, which flatters it. Read the
MCP column as "MCP with lazy schema loading", not "MCP as the papers model it".

Getting this wrong the first time produced garbage: with `ToolSearch` excluded
from `--allowedTools`, the agent could see tool names but never load them, fell
back to the open web, and burned 14–17 turns failing. Those numbers looked like
evidence and were not. Both arms must be verified to actually reach their tools
before any run counts.

## Two honest caveats

**The lossless adjustment matters.** `--agent-help --all` truncates each
description to its first line, so part of its apparent saving is dropped
information, not efficiency. On `mcp-nixos` that is 40% of the gap: the MCP
description carries `type: Type of lookup - "package" or "option"`, a constraint
with no enum in the schema. An agent reading only the truncated form would have
to guess. **1.55x is the defensible format-efficiency number; 2.38x is not.**

Progressive disclosure dissolves this — the command level carries the full
description, because only one command is expanded at a time.

**The multiplier is a function of catalog size, not architecture.** 3.6x on a
34-tool setup, 76.9x at 1000 operations. Any single headline number quoted
without an operation count — including the widely repeated "35x" — is
unfalsifiable.

## Running Phase B

Costs real API spend — roughly $2 for the nine runs.

```bash
node bench/harness/mcp-shim.mjs 8901 \
  "math=<dir>/math-mcp:node build/index.js" \
  "met=<dir>/metmuseum-mcp:node dist/index.js" \
  "nixos=<dir>/mcp-nixos:.venv/bin/python mcp_nixos/server.py" &

node bench/harness/run-agent.mjs all
python3 bench/harness/analyze-phase-b.py
```

The shim fronts the same MCP servers over HTTP so spec2cli can call them, which
is what makes the arms comparable: identical tools, identical implementations,
only the access layer differs.

## The experiment that would settle it

The ~880-operation crossover is a property of the *agent*, not of spec2cli.
Claude Code resends ~31k tokens of its own context per turn, which is what makes
an extra discovery step cost so much. A lean loop — minimal system prompt, one
tool — resends far less and should cross over much sooner.

`harness/lean-agent.mjs` runs the same three arms and the same tasks against the
Anthropic API directly. It needs `ANTHROPIC_API_KEY` and has not been run:

```bash
ANTHROPIC_API_KEY=... node bench/harness/lean-agent.mjs cli-flat
ANTHROPIC_API_KEY=... node bench/harness/lean-agent.mjs cli
```

It prints context-resent-per-turn, which is the term that moves the crossover.
If that lands near 2k rather than 31k, progressive disclosure becomes worth
defaulting to at ordinary spec sizes and `PROGRESSIVE_THRESHOLD` in
`src/cli/agent-help.ts` should come down.

## Not measured here

Task quality beyond a correctness check, latency, and variance — every cell is a
single run. The direction is consistent across three tasks but N=1 per cell will
not survive scrutiny on its own. Judges and repeated runs were out of scope.
