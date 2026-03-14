#!/bin/bash
# ═══════════════════════════════════════════════════════════
#  MCP-C Agent Test
#
#  Gives the same task to Claude via 3 different approaches
#  and compares token consumption + accuracy.
#
#  Prerequisites:
#    - claude CLI installed (npm install -g @anthropic-ai/claude-code)
#    - Todo API server running (node examples/todo-api/server.mjs)
#
#  Usage: bash examples/agent-test/run.sh
# ═══════════════════════════════════════════════════════════

set -e

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
RESULTS_DIR="$ROOT/examples/agent-test/results"
SPEC="$ROOT/examples/todo-api/openapi.yaml"
TOKEN="test-token-123"
TASK="List the pending todos from the API at http://localhost:4000. Find the one with the highest priority. Then mark that todo as done. Tell me which todo you marked as done and why."

mkdir -p "$RESULTS_DIR"

# Colors
C="\033[36m"
G="\033[32m"
Y="\033[33m"
D="\033[90m"
R="\033[0m"

# Extract metrics from claude JSON output
extract_metrics() {
  local file="$1"
  if [ ! -f "$file" ]; then echo "?|?|?|?|?|?"; return; fi

  jq -r '[
    (.usage.input_tokens + .usage.cache_creation_input_tokens + .usage.cache_read_input_tokens),
    .usage.cache_creation_input_tokens,
    .usage.cache_read_input_tokens,
    .usage.output_tokens,
    .num_turns,
    .total_cost_usd
  ] | map(tostring) | join("|")' "$file" 2>/dev/null || echo "?|?|?|?|?|?"
}

echo -e "${C}═══════════════════════════════════════════════════════════${R}"
echo -e "${C}  MCP-C Agent Test: 3 approaches, same task${R}"
echo -e "${C}═══════════════════════════════════════════════════════════${R}"
echo ""

# Check if server is running
if ! curl -s http://localhost:4000/todos > /dev/null 2>&1; then
  echo "Starting Todo API server..."
  node "$ROOT/examples/todo-api/server.mjs" &
  SERVER_PID=$!
  sleep 1
  echo -e "${G}Server started (PID $SERVER_PID)${R}"
  trap "kill $SERVER_PID 2>/dev/null" EXIT
else
  echo -e "${G}Todo API server already running${R}"
fi

echo ""
echo -e "${D}Task: $TASK${R}"
echo ""

# ──────────────────────────────────────────────────────────
# Approach 1: MCP-style (all schemas upfront in system prompt)
# ──────────────────────────────────────────────────────────
echo -e "${C}━━━ Approach 1: MCP-style (all schemas in context) ━━━${R}"
echo -e "${D}Agent gets all tool schemas in the system prompt upfront.${R}"
echo -e "${D}No discovery needed — everything is pre-loaded.${R}"
echo ""

MCP_SYSTEM_PROMPT="You have access to a Todo API at http://localhost:4000. Here are ALL the available tools:

Tool 1: listTodos
  Method: GET /todos
  Params: status (query, enum: pending|done|all), limit (query, integer)
  Auth: none

Tool 2: createTodo
  Method: POST /todos
  Body: title (string, required), description (string), priority (enum: low|medium|high), tags (string)
  Auth: Bearer token required

Tool 3: getTodo
  Method: GET /todos/{id}
  Params: id (path, integer, required)
  Auth: none

Tool 4: updateTodo
  Method: PUT /todos/{id}
  Params: id (path, integer, required)
  Body: title (string), description (string), status (enum: pending|done), priority (enum: low|medium|high)
  Auth: Bearer token required. Use token: $TOKEN

Tool 5: deleteTodo
  Method: DELETE /todos/{id}
  Params: id (path, integer, required)
  Auth: Bearer token required

Tool 6: listTags
  Method: GET /tags
  Auth: none

Use curl to call these endpoints. The auth token is: $TOKEN"

echo "Running..."
claude -p "$TASK" \
  --allowedTools "Bash(curl *)" \
  --output-format json \
  --append-system-prompt "$MCP_SYSTEM_PROMPT" \
  2>/dev/null > "$RESULTS_DIR/mcp-style.json" || true

MCP_METRICS=$(extract_metrics "$RESULTS_DIR/mcp-style.json")
MCP_RESULT=$(jq -r '.result // "no result"' "$RESULTS_DIR/mcp-style.json" 2>/dev/null | head -3)
echo -e "${G}Done.${R} $(echo "$MCP_RESULT" | head -1)"
echo ""

# ──────────────────────────────────────────────────────────
# Approach 2: CLI raw (agent discovers via curl)
# ──────────────────────────────────────────────────────────
echo -e "${C}━━━ Approach 2: CLI raw (no schema, figure it out) ━━━${R}"
echo -e "${D}Agent knows only the base URL. Must discover endpoints by exploring.${R}"
echo ""

CLI_SYSTEM_PROMPT="There is a REST API at http://localhost:4000. You don't know the endpoints yet. Start by trying GET /todos to discover the API. Use curl for all requests. When you need to make authenticated requests, use the Bearer token: $TOKEN (pass as -H 'Authorization: Bearer $TOKEN')."

echo "Running..."
claude -p "$TASK" \
  --allowedTools "Bash(curl *)" \
  --output-format json \
  --append-system-prompt "$CLI_SYSTEM_PROMPT" \
  2>/dev/null > "$RESULTS_DIR/cli-raw.json" || true

CLI_METRICS=$(extract_metrics "$RESULTS_DIR/cli-raw.json")
CLI_RESULT=$(jq -r '.result // "no result"' "$RESULTS_DIR/cli-raw.json" 2>/dev/null | head -3)
echo -e "${G}Done.${R} $(echo "$CLI_RESULT" | head -1)"
echo ""

# ──────────────────────────────────────────────────────────
# Approach 3: MCP-C (progressive discovery)
# ──────────────────────────────────────────────────────────
echo -e "${C}━━━ Approach 3: MCP-C (progressive discovery) ━━━${R}"
echo -e "${D}Agent uses mcp-c --discover to progressively learn the API.${R}"
echo ""

MCPC_SYSTEM_PROMPT="You have access to an API via the mcp-c CLI tool. To discover what the API can do, use progressive discovery:

Phase 1 (manifest): node $ROOT/dist/index.js --spec $SPEC --discover
Phase 2 (group):    node $ROOT/dist/index.js --spec $SPEC --discover <group>
Phase 3 (command):  node $ROOT/dist/index.js --spec $SPEC --discover <group> <command>

To execute commands:
  node $ROOT/dist/index.js --spec $SPEC --output json [--token TOKEN] <group> <command> [--flags]

The auth token is: $TOKEN
Start with Phase 1 to see what's available, then drill down only into what you need."

echo "Running..."
claude -p "$TASK" \
  --allowedTools "Bash(node *)" \
  --output-format json \
  --append-system-prompt "$MCPC_SYSTEM_PROMPT" \
  2>/dev/null > "$RESULTS_DIR/mcp-c.json" || true

MCPC_METRICS=$(extract_metrics "$RESULTS_DIR/mcp-c.json")
MCPC_RESULT=$(jq -r '.result // "no result"' "$RESULTS_DIR/mcp-c.json" 2>/dev/null | head -3)
echo -e "${G}Done.${R} $(echo "$MCPC_RESULT" | head -1)"
echo ""

# ──────────────────────────────────────────────────────────
# Results
# ──────────────────────────────────────────────────────────

# Parse metrics: total_input|cache_create|cache_read|output|turns|cost
parse() { echo "$1" | cut -d'|' -f"$2"; }

echo -e "${C}═══════════════════════════════════════════════════════════${R}"
echo -e "${C}  RESULTS${R}"
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
echo "  What each column means:"
echo "    Total Input:   All input tokens (new + cache_create + cache_read)"
echo "    Cache Create:  Tokens written to cache (system prompt + first turn)"
echo "    Cache Read:    Tokens re-read from cache in subsequent turns"
echo "    Output:        Tokens generated by the model"
echo "    Turns:         Number of agent loop iterations"
echo "    Cost:          Actual USD cost of the run"
echo ""
echo "  NOTE: More turns = more cache_read, because the full conversation"
echo "  is re-read on every turn. MCP-C's progressive discovery requires"
echo "  more turns (discover → drill down → execute), which inflates"
echo "  cache_read even though each individual payload is smaller."
echo ""
echo "  Task results:"
echo "    MCP-style: $(echo "$MCP_RESULT" | head -1)"
echo "    CLI raw:   $(echo "$CLI_RESULT" | head -1)"
echo "    MCP-C:     $(echo "$MCPC_RESULT" | head -1)"
echo ""
echo "  Full JSON: $RESULTS_DIR/"
