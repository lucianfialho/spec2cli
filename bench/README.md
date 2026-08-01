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

## Not measured here

Turns, task success, latency under a real agent loop. Those need the execution
half of the shim (an HTTP server fronting the MCP servers so spec2cli can
actually call them) and real API spend. The token result above is what justifies
building that; it does not substitute for it.
