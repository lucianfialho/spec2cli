#!/usr/bin/env python3
"""End-to-end context cost of a realistic task, MCP vs progressive spec2cli.

The root-level footprint alone flatters spec2cli: the agent still has to drill
down, and every drill-down is more context. What decides the thesis is the total
an agent pays to reach the point where it can issue the call.

Scenario: three servers are connected (as in an MCP-Bench multi-server task) and
the task needs N specific commands from one of them.

  MCP        every tool of every connected server, loaded upfront
  spec2cli   one root per server, then one group listing, then one detail per
             command actually used

Usage:  python3 bench/harness/drilldown.py
"""
import json
import os
import subprocess

import tiktoken

ENC = tiktoken.get_encoding("o200k_base")
BENCH = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CLI = os.path.join(os.path.dirname(BENCH), "dist", "index.js")

SERVERS = ["math", "met", "nixos"]

# Commands a task would actually reach for, per target server.
SCENARIOS = [
    ("nixos", "nixos", ["nixos_search", "nixos_info"]),
    ("math", "math", ["add", "multiply"]),
    ("met", "met", ["search-museum-objects"]),
]

t = lambda s: len(ENC.encode(s))


def help_at(server: str, *args: str) -> str:
    return subprocess.run(
        ["node", CLI, "--spec", f"{BENCH}/specs/{server}.json", "--agent-help", *args],
        capture_output=True, text=True,
    ).stdout


def mcp_tokens(server: str) -> int:
    d = json.load(open(f"{BENCH}/dumps/{server}.json"))
    return t(json.dumps([
        {"name": x["name"], "description": x.get("description", ""),
         "input_schema": x.get("inputSchema", {})}
        for x in d["tools"]
    ]))


# Every connected server costs context in both arms; MCP pays full, spec2cli pays root.
mcp_all = sum(mcp_tokens(s) for s in SERVERS)
roots = sum(t(help_at(s)) for s in SERVERS)

print(f"\n3 servers connected — MCP loads {mcp_all:,} tokens upfront, "
      f"spec2cli loads {roots:,}\n")
print(f"{'task target':<10}{'cmds':>5}{'MCP':>9}{'root':>7}{'group':>8}{'detail':>8}{'total':>8}{'ratio':>8}")
print("-" * 64)

for target, group, commands in SCENARIOS:
    group_toks = t(help_at(target, group))
    detail = sum(t(help_at(target, group, c)) for c in commands)
    total = roots + group_toks + detail
    print(f"{target:<10}{len(commands):>5}{mcp_all:>9,}{roots:>7,}"
          f"{group_toks:>8,}{detail:>8,}{total:>8,}{mcp_all/total:>7.2f}x")

print("-" * 64)
print("\nMCP cost is fixed at connect time; spec2cli cost scales with what the")
print("task actually touches. The gap widens with more connected servers and")
print("narrows as a task touches more of them.")

# The three real servers are small (34 tools total). The effect that decides the
# thesis only shows up on a catalog large enough for the flat dump to hurt, so
# measure the progressive gain in isolation on a synthetic spec.
SYNTH = f"{BENCH}/specs/large.json"
if os.path.exists(SYNTH):
    def synth(*args: str) -> int:
        return t(subprocess.run(
            ["node", CLI, "--spec", SYNTH, "--agent-help", *args],
            capture_output=True, text=True,
        ).stdout)

    flat = synth("--all")
    root = synth()
    group = synth("group0")
    detail = synth("group0", "getgroup0resource0")
    path = root + group + detail

    print(f"\n{'':-<64}")
    print("scaling — 1000 operations across 25 groups (synthetic)\n")
    print(f"  flat dump (--all)      {flat:>8,} tokens")
    print(f"  root                   {root:>8,}   (scales with groups, not operations)")
    print(f"  + group listing        {group:>8,}   (scales with that group only)")
    print(f"  + one command detail   {detail:>8,}   (constant)")
    print(f"  {'':=<38}")
    print(f"  progressive path       {path:>8,} tokens   {flat/path:>6.1f}x smaller")
    print("\nThe gain is a function of catalog size. Quoting a single multiplier")
    print("without stating the operation count is meaningless.")
