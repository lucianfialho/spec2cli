#!/usr/bin/env python3
"""Static context footprint: MCP tool definitions vs spec2cli --agent-help.

Measures what each access layer injects into the model context before any work
happens. No API calls, no cost.

The spec2cli saving splits into two parts, which are not equally honest:

  format gain  lossless. JSON Schema boilerplate ("title", nested "properties",
               braces and quotes) replaced by compact YAML.
  info loss    --agent-help truncates each description to its first line. MCP
               ships the full docstring, which often carries per-parameter
               semantics absent from the JSON Schema itself.

Only the format gain is defensible as an architectural win.

Usage:  python3 bench/harness/footprint.py
"""
import json
import os
import subprocess

import tiktoken

ENC = tiktoken.get_encoding("o200k_base")
BENCH = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CLI = os.path.join(os.path.dirname(BENCH), "dist", "index.js")

SERVERS = ["math", "met", "nixos"]


def toks(s: str) -> int:
    return len(ENC.encode(s))


def mcp_context(server: str) -> tuple[int, int]:
    """What an MCP client injects: tool definitions as sent to the model."""
    d = json.load(open(f"{BENCH}/dumps/{server}.json"))
    payload = [
        {
            "name": t["name"],
            "description": t.get("description", ""),
            "input_schema": t.get("inputSchema", {}),
        }
        for t in d["tools"]
    ]
    return toks(json.dumps(payload)), len(d["tools"])


def agent_help(server: str, *args: str) -> str:
    out = subprocess.run(
        ["node", CLI, "--spec", f"{BENCH}/specs/{server}.json", "--agent-help", *args],
        capture_output=True,
        text=True,
    )
    return out.stdout


def dropped_description_tokens(server: str) -> int:
    """Tokens --agent-help discards by keeping only the first description line."""
    d = json.load(open(f"{BENCH}/dumps/{server}.json"))
    return sum(
        toks(t.get("description", "")) - toks(t.get("description", "").split("\n")[0])
        for t in d["tools"]
    )


rows = []
for s in SERVERS:
    mcp, n = mcp_context(s)
    full = toks(agent_help(s, "--all"))
    root = toks(agent_help(s))
    rows.append((s, n, mcp, full, full + dropped_description_tokens(s), root))

print(f"\n{'server':<9}{'tools':>6}{'MCP':>9}{'s2c --all':>11}{'lossless':>10}{'s2c root':>10}")
print("-" * 56)
TM = TF = TL = TR = TN = 0
for s, n, mcp, full, lossless, root in rows:
    TM += mcp; TF += full; TL += lossless; TR += root; TN += n
    print(f"{s:<9}{n:>6}{mcp:>9,}{full:>11,}{lossless:>10,}{root:>10,}")
print("-" * 56)
print(f"{'TOTAL':<9}{TN:>6}{TM:>9,}{TF:>11,}{TL:>10,}{TR:>10,}")

print(f"\nfull dump, as-is     {TM/TF:>7.2f}x smaller ({1-TF/TM:>4.0%})  <- includes information loss")
print(f"full dump, lossless  {TM/TL:>7.2f}x smaller ({1-TL/TM:>4.0%})  <- pure format efficiency")
if TR:
    print(f"progressive root     {TM/TR:>7.2f}x smaller ({1-TR/TM:>4.0%})  <- what the agent loads first")
