#!/bin/bash
# ═══════════════════════════════════════════════════════════
#  MCP-C Large API Agent Test (56 endpoints)
#
#  This is the test that validates the thesis: progressive
#  discovery should win when the API has many endpoints.
#
#  Usage: bash examples/large-api/agent-test.sh
# ═══════════════════════════════════════════════════════════

set -e

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
RESULTS_DIR="$ROOT/examples/large-api/results"
SPEC="$ROOT/examples/large-api/openapi.yaml"
TOKEN="pm-token-456"

# Task that requires the agent to find the right endpoint among 56 options
TASK="Using the Project Management API at http://localhost:4001, find all critical priority tasks in the 'MCP-C Protocol' project (project ID 1) and mark the one called 'Publish to npm' as done. Tell me what you did."

mkdir -p "$RESULTS_DIR"

C="\033[36m"; G="\033[32m"; D="\033[90m"; R="\033[0m"

extract_metrics() {
  local file="$1"
  [ ! -f "$file" ] && echo "?|?|?|?|?|?" && return
  jq -r '[
    (.usage.input_tokens + .usage.cache_creation_input_tokens + .usage.cache_read_input_tokens),
    .usage.cache_creation_input_tokens,
    .usage.cache_read_input_tokens,
    .usage.output_tokens,
    .num_turns,
    .total_cost_usd
  ] | map(tostring) | join("|")' "$file" 2>/dev/null || echo "?|?|?|?|?|?"
}
parse() { echo "$1" | cut -d'|' -f"$2"; }

echo -e "${C}═══════════════════════════════════════════════════════════${R}"
echo -e "${C}  MCP-C Large API Test (56 endpoints)${R}"
echo -e "${C}═══════════════════════════════════════════════════════════${R}"
echo ""

# Start server if needed
if ! curl -s http://localhost:4001/projects > /dev/null 2>&1; then
  echo "Starting Project Management API..."
  node "$ROOT/examples/large-api/server.mjs" &
  SERVER_PID=$!
  sleep 1
  trap "kill $SERVER_PID 2>/dev/null" EXIT
fi
echo -e "${G}API running (56 endpoints, 12 groups)${R}"
echo -e "${D}Task: $TASK${R}"
echo ""

# ─── MCP-style: all 56 tool schemas in system prompt ───
echo -e "${C}━━━ Approach 1: MCP-style (all 56 schemas upfront) ━━━${R}"

# Generate full tool descriptions from the spec
ALL_SCHEMAS=$(node -e "
const { readFileSync } = require('fs');
const { parse } = require('yaml');
const spec = parse(readFileSync('$SPEC', 'utf8'));
let out = '';
let i = 0;
for (const [path, methods] of Object.entries(spec.paths)) {
  for (const [method, op] of Object.entries(methods)) {
    if (['get','post','put','delete','patch'].indexOf(method) === -1) continue;
    i++;
    out += 'Tool ' + i + ': ' + (op.operationId || method + ' ' + path) + '\n';
    out += '  Method: ' + method.toUpperCase() + ' ' + path + '\n';
    if (op.parameters) {
      out += '  Params: ' + op.parameters.map(p => p.name + ' (' + p.in + ', ' + (p.schema?.type || 'string') + (p.required ? ', required' : '') + ')').join(', ') + '\n';
    }
    if (op.requestBody) {
      const schema = op.requestBody.content?.['application/json']?.schema;
      if (schema?.properties) {
        out += '  Body: ' + Object.entries(schema.properties).map(([k,v]) => k + ' (' + (v.type || 'string') + ')').join(', ') + '\n';
      }
    }
    out += '  Auth: ' + (op.security ? 'Bearer token required' : 'none') + '\n\n';
  }
}
process.stdout.write(out);
")

MCP_SYSTEM_PROMPT="You have access to a Project Management API at http://localhost:4001. Here are ALL available tools:

$ALL_SCHEMAS

Use curl for all requests. Auth token: $TOKEN"

echo "Running (all 56 schemas in prompt)..."
claude -p "$TASK" \
  --allowedTools "Bash(curl *)" \
  --output-format json \
  --append-system-prompt "$MCP_SYSTEM_PROMPT" \
  2>/dev/null > "$RESULTS_DIR/mcp-style.json" || true

MCP_METRICS=$(extract_metrics "$RESULTS_DIR/mcp-style.json")
MCP_RESULT=$(jq -r '.result // "?"' "$RESULTS_DIR/mcp-style.json" 2>/dev/null | head -2)
echo -e "${G}Done.${R} $(echo "$MCP_RESULT" | head -1)"
echo ""

# ─── CLI raw ───
echo -e "${C}━━━ Approach 2: CLI raw (explore via curl) ━━━${R}"

CLI_SYSTEM_PROMPT="There is a Project Management API at http://localhost:4001. You don't know the endpoints. Explore by trying requests. Auth token: $TOKEN (use -H 'Authorization: Bearer $TOKEN')."

echo "Running (no schema, explore)..."
claude -p "$TASK" \
  --allowedTools "Bash(curl *)" \
  --output-format json \
  --append-system-prompt "$CLI_SYSTEM_PROMPT" \
  2>/dev/null > "$RESULTS_DIR/cli-raw.json" || true

CLI_METRICS=$(extract_metrics "$RESULTS_DIR/cli-raw.json")
CLI_RESULT=$(jq -r '.result // "?"' "$RESULTS_DIR/cli-raw.json" 2>/dev/null | head -2)
echo -e "${G}Done.${R} $(echo "$CLI_RESULT" | head -1)"
echo ""

# ─── MCP-C (progressive discovery) ───
echo -e "${C}━━━ Approach 3: MCP-C (progressive discovery, 56 endpoints) ━━━${R}"

MCPC_SYSTEM_PROMPT="You have access to a Project Management API via mcp-c. This is a large API (56 endpoints, 12 groups). Use progressive discovery to find what you need:

Phase 1 (manifest): node $ROOT/dist/index.js --spec $SPEC --discover
Phase 2 (group):    node $ROOT/dist/index.js --spec $SPEC --discover <group>
Phase 3 (command):  node $ROOT/dist/index.js --spec $SPEC --discover <group> <command>

Execute: node $ROOT/dist/index.js --spec $SPEC --output json [--token TOKEN] <group> <command> [--flags]

Auth token: $TOKEN
Only discover the groups you need for the task."

echo "Running (progressive discovery)..."
claude -p "$TASK" \
  --allowedTools "Bash(node *)" \
  --output-format json \
  --append-system-prompt "$MCPC_SYSTEM_PROMPT" \
  2>/dev/null > "$RESULTS_DIR/mcp-c.json" || true

MCPC_METRICS=$(extract_metrics "$RESULTS_DIR/mcp-c.json")
MCPC_RESULT=$(jq -r '.result // "?"' "$RESULTS_DIR/mcp-c.json" 2>/dev/null | head -2)
echo -e "${G}Done.${R} $(echo "$MCPC_RESULT" | head -1)"
echo ""

# ─── Results ───
echo -e "${C}═══════════════════════════════════════════════════════════${R}"
echo -e "${C}  RESULTS (56-endpoint API)${R}"
echo -e "${C}═══════════════════════════════════════════════════════════${R}"
echo ""
echo "  Approach          │ Total Input │ Cache Create │ Cache Read  │   Output │ Turns │   Cost"
echo "  ──────────────────┼─────────────┼──────────────┼─────────────┼──────────┼───────┼────────"
printf "  MCP-style         │ %11s │ %12s │ %11s │ %8s │ %5s │ \$%s\n" \
  "$(parse "$MCP_METRICS" 1)" "$(parse "$MCP_METRICS" 2)" "$(parse "$MCP_METRICS" 3)" \
  "$(parse "$MCP_METRICS" 4)" "$(parse "$MCP_METRICS" 5)" "$(parse "$MCP_METRICS" 6)"
printf "  CLI raw           │ %11s │ %12s │ %11s │ %8s │ %5s │ \$%s\n" \
  "$(parse "$CLI_METRICS" 1)" "$(parse "$CLI_METRICS" 2)" "$(parse "$CLI_METRICS" 3)" \
  "$(parse "$CLI_METRICS" 4)" "$(parse "$CLI_METRICS" 5)" "$(parse "$CLI_METRICS" 6)"
printf "  MCP-C             │ %11s │ %12s │ %11s │ %8s │ %5s │ \$%s\n" \
  "$(parse "$MCPC_METRICS" 1)" "$(parse "$MCPC_METRICS" 2)" "$(parse "$MCPC_METRICS" 3)" \
  "$(parse "$MCPC_METRICS" 4)" "$(parse "$MCPC_METRICS" 5)" "$(parse "$MCPC_METRICS" 6)"
echo ""
echo "  Task:"
echo "    MCP-style: $(echo "$MCP_RESULT" | head -1)"
echo "    CLI raw:   $(echo "$CLI_RESULT" | head -1)"
echo "    MCP-C:     $(echo "$MCPC_RESULT" | head -1)"
echo ""
echo "  Full JSON: $RESULTS_DIR/"
