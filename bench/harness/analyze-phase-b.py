#!/usr/bin/env python3
"""Phase B summary, plus the crossover the turn counts imply.

Progressive disclosure buys a smaller upfront catalog and pays for it in round
trips. Phase A measured only the first half of that trade. This works out where
the two halves balance.
"""
import json
import os
from collections import defaultdict

BENCH = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
rows = json.load(open(f"{BENCH}/results/phase-b-all.json"))
rows = [r for r in rows if "error" not in r]

ARMS = ["mcp", "cli-flat", "cli"]
LABEL = {"mcp": "MCP", "cli-flat": "spec2cli --all", "cli": "spec2cli progressive"}

by_task = defaultdict(dict)
for r in rows:
    by_task[r["task"]][r["arm"]] = r

print(f"\n{'task':<16}" + "".join(f"{LABEL[a]:>22}" for a in ARMS))
print("-" * 82)
for task, arms in by_task.items():
    cells = []
    for a in ARMS:
        r = arms.get(a)
        cells.append(f"{r['turns']}t / {r['input_tokens']//1000}k" if r else "-")
    print(f"{task:<16}" + "".join(f"{c:>22}" for c in cells))

print("-" * 82)
totals = {a: (sum(t[a]["turns"] for t in by_task.values() if a in t),
              sum(t[a]["input_tokens"] for t in by_task.values() if a in t)) for a in ARMS}
print(f"{'TOTAL':<16}" + "".join(f"{f'{totals[a][0]}t / {totals[a][1]//1000}k':>22}" for a in ARMS))

misses = [r for r in rows if not r["ok"]]
print(f"\nfailed tasks: {len(misses)}/{len(rows)}")

# Cost of one extra round trip, averaged over every run: the whole conversation
# is resent each turn, so this is what an extra discovery step actually buys.
per_turn = sum(r["input_tokens"] for r in rows) / sum(r["turns"] for r in rows)
print(f"\naverage context resent per turn: {per_turn:,.0f} tokens")

extra_turns = totals["cli"][0] - totals["cli-flat"][0]
print(f"progressive costs {extra_turns} extra turns across {len(by_task)} tasks "
      f"= {extra_turns * per_turn:,.0f} tokens")

# Phase A numbers: what the flat catalog costs at a given operation count.
TOKENS_PER_OP = 84_000 / 1000  # spec2cli --all, measured on the synthetic spec
PROGRESSIVE_PATH = 1_100       # root + group + one command, near-constant
print("\ncrossover — where a smaller catalog starts to pay for its round trips")
print(f"{'operations':>12}{'flat catalog':>15}{'progressive':>13}{'saved':>10}{'verdict':>12}")
for ops in (34, 100, 250, 500, 1000, 2000, 4000):
    flat = ops * TOKENS_PER_OP if ops > 34 else 1_894  # 34 = measured directly
    saved = flat - PROGRESSIVE_PATH
    cost = (extra_turns / len(by_task)) * per_turn
    print(f"{ops:>12,}{flat:>15,.0f}{PROGRESSIVE_PATH:>13,}{saved:>10,.0f}"
          f"{'progressive' if saved > cost else 'flat':>12}")
print(f"\n  a round trip costs ~{(extra_turns / len(by_task)) * per_turn:,.0f} tokens, "
      f"so progressive only pays above ~{((extra_turns / len(by_task)) * per_turn + PROGRESSIVE_PATH) / TOKENS_PER_OP:,.0f} operations")
