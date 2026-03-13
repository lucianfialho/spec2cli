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
R="\033[0m"

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
echo "Task: $TASK"
echo ""

# ──────────────────────────────────────────────────────────
# Approach 1: MCP-style (all schemas upfront in system prompt)
# ──────────────────────────────────────────────────────────
echo -e "${C}━━━ Approach 1: MCP-style (all schemas in context) ━━━${R}"

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
  Auth: Bearer token required. Use: --token $TOKEN

Tool 5: deleteTodo
  Method: DELETE /todos/{id}
  Params: id (path, integer, required)
  Auth: Bearer token required

Tool 6: listTags
  Method: GET /tags
  Auth: none

Use curl to call these endpoints. The auth token is: $TOKEN"

echo "Running claude with all tool schemas in system prompt..."
claude -p "$TASK" \
  --allowedTools "Bash(curl *)" \
  --output-format json \
  --append-system-prompt "$MCP_SYSTEM_PROMPT" \
  2>/dev/null > "$RESULTS_DIR/mcp-style.json" || true

if [ -f "$RESULTS_DIR/mcp-style.json" ]; then
  MCP_RESULT=$(cat "$RESULTS_DIR/mcp-style.json" | jq -r '.result // "no result"' 2>/dev/null || echo "parse error")
  MCP_INPUT=$(cat "$RESULTS_DIR/mcp-style.json" | jq -r '.usage.input_tokens // "?"' 2>/dev/null || echo "?")
  MCP_OUTPUT=$(cat "$RESULTS_DIR/mcp-style.json" | jq -r '.usage.output_tokens // "?"' 2>/dev/null || echo "?")
  echo -e "${G}Done.${R}"
  echo "  Input tokens:  $MCP_INPUT"
  echo "  Output tokens: $MCP_OUTPUT"
  echo "  Result: $(echo "$MCP_RESULT" | head -3)"
else
  echo "  Failed to run"
  MCP_INPUT="?"
  MCP_OUTPUT="?"
fi
echo ""

# ──────────────────────────────────────────────────────────
# Approach 2: CLI raw (agent discovers via curl + reads responses)
# ──────────────────────────────────────────────────────────
echo -e "${C}━━━ Approach 2: CLI raw (no schema, figure it out) ━━━${R}"

CLI_SYSTEM_PROMPT="There is a REST API at http://localhost:4000. You don't know the endpoints yet. Start by trying GET /todos to discover the API. Use curl for all requests. When you need to make authenticated requests, use the Bearer token: $TOKEN (pass as -H 'Authorization: Bearer $TOKEN')."

echo "Running claude with no upfront schema..."
claude -p "$TASK" \
  --allowedTools "Bash(curl *)" \
  --output-format json \
  --append-system-prompt "$CLI_SYSTEM_PROMPT" \
  2>/dev/null > "$RESULTS_DIR/cli-raw.json" || true

if [ -f "$RESULTS_DIR/cli-raw.json" ]; then
  CLI_RESULT=$(cat "$RESULTS_DIR/cli-raw.json" | jq -r '.result // "no result"' 2>/dev/null || echo "parse error")
  CLI_INPUT=$(cat "$RESULTS_DIR/cli-raw.json" | jq -r '.usage.input_tokens // "?"' 2>/dev/null || echo "?")
  CLI_OUTPUT=$(cat "$RESULTS_DIR/cli-raw.json" | jq -r '.usage.output_tokens // "?"' 2>/dev/null || echo "?")
  echo -e "${G}Done.${R}"
  echo "  Input tokens:  $CLI_INPUT"
  echo "  Output tokens: $CLI_OUTPUT"
  echo "  Result: $(echo "$CLI_RESULT" | head -3)"
else
  echo "  Failed to run"
  CLI_INPUT="?"
  CLI_OUTPUT="?"
fi
echo ""

# ──────────────────────────────────────────────────────────
# Approach 3: MCP-C (progressive discovery)
# ──────────────────────────────────────────────────────────
echo -e "${C}━━━ Approach 3: MCP-C (progressive discovery) ━━━${R}"

MCPC_SYSTEM_PROMPT="You have access to an API via the mcp-c CLI tool. To discover what the API can do, use progressive discovery:

Phase 1 (manifest): node $ROOT/dist/index.js --spec $SPEC --discover
Phase 2 (group):    node $ROOT/dist/index.js --spec $SPEC --discover <group>
Phase 3 (command):  node $ROOT/dist/index.js --spec $SPEC --discover <group> <command>

To execute commands:
  node $ROOT/dist/index.js --spec $SPEC --output json [--token TOKEN] <group> <command> [--flags]

The auth token is: $TOKEN
Start with Phase 1 to see what's available, then drill down only into what you need."

echo "Running claude with mcp-c progressive discovery..."
claude -p "$TASK" \
  --allowedTools "Bash(node *)" \
  --output-format json \
  --append-system-prompt "$MCPC_SYSTEM_PROMPT" \
  2>/dev/null > "$RESULTS_DIR/mcp-c.json" || true

if [ -f "$RESULTS_DIR/mcp-c.json" ]; then
  MCPC_RESULT=$(cat "$RESULTS_DIR/mcp-c.json" | jq -r '.result // "no result"' 2>/dev/null || echo "parse error")
  MCPC_INPUT=$(cat "$RESULTS_DIR/mcp-c.json" | jq -r '.usage.input_tokens // "?"' 2>/dev/null || echo "?")
  MCPC_OUTPUT=$(cat "$RESULTS_DIR/mcp-c.json" | jq -r '.usage.output_tokens // "?"' 2>/dev/null || echo "?")
  echo -e "${G}Done.${R}"
  echo "  Input tokens:  $MCPC_INPUT"
  echo "  Output tokens: $MCPC_OUTPUT"
  echo "  Result: $(echo "$MCPC_RESULT" | head -3)"
else
  echo "  Failed to run"
  MCPC_INPUT="?"
  MCPC_OUTPUT="?"
fi
echo ""

# ──────────────────────────────────────────────────────────
# Summary
# ──────────────────────────────────────────────────────────
echo -e "${C}═══════════════════════════════════════════════════════════${R}"
echo -e "${C}  RESULTS${R}"
echo -e "${C}═══════════════════════════════════════════════════════════${R}"
echo ""
echo "  Approach          │ Input tokens │ Output tokens │ Total"
echo "  ──────────────────┼──────────────┼───────────────┼──────────"
echo "  MCP-style         │ $(printf '%12s' "$MCP_INPUT") │ $(printf '%13s' "$MCP_OUTPUT") │ $(printf '%8s' "?")"
echo "  CLI raw           │ $(printf '%12s' "$CLI_INPUT") │ $(printf '%13s' "$CLI_OUTPUT") │ $(printf '%8s' "?")"
echo "  MCP-C             │ $(printf '%12s' "$MCPC_INPUT") │ $(printf '%13s' "$MCPC_OUTPUT") │ $(printf '%8s' "?")"
echo ""
echo "  Full results saved to: $RESULTS_DIR/"
echo ""
echo "  To inspect each run:"
echo "    cat $RESULTS_DIR/mcp-style.json | jq '.result'"
echo "    cat $RESULTS_DIR/cli-raw.json | jq '.result'"
echo "    cat $RESULTS_DIR/mcp-c.json | jq '.result'"
echo ""
echo "  NOTE: Token counts include the full conversation (system prompt +"
echo "  agent reasoning + tool calls + tool results). The MCP-style approach"
echo "  has a larger system prompt (all schemas), while MCP-C discovers"
echo "  schemas incrementally via tool calls."
