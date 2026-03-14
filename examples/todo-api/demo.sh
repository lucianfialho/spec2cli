#!/bin/bash
# ═══════════════════════════════════════════════════════════
#  tocli Demo: Todo API
#
#  This script starts a local Todo API and demonstrates
#  every tocli feature against it.
#
#  Usage: bash examples/todo-api/demo.sh
# ═══════════════════════════════════════════════════════════

set -e

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TOCLI="node $ROOT/dist/index.js"
SPEC="$ROOT/examples/todo-api/openapi.yaml"
TOKEN="test-token-123"

C="\033[36m"; G="\033[32m"; Y="\033[33m"; R="\033[0m"
step() { echo -e "\n${C}━━━ $1 ━━━${R}\n"; }
run() { echo -e "${Y}\$ $@${R}"; eval "$@"; echo ""; }

# Start server
step "Starting Todo API server..."
node "$ROOT/examples/todo-api/server.mjs" &
SERVER_PID=$!
sleep 1
cleanup() { kill $SERVER_PID 2>/dev/null; }
trap cleanup EXIT
echo -e "${G}Server running (PID $SERVER_PID)${R}"

# ─── Read ───
step "List all todos (JSON)"
run "$TOCLI --spec $SPEC --output json todos list | jq ."

step "List all todos (table)"
run "$TOCLI --spec $SPEC --output table todos list"

step "List pending todos only"
run "$TOCLI --spec $SPEC --output table todos list --status pending"

step "List with --max-items 3"
run "$TOCLI --spec $SPEC --output json --max-items 3 todos list | jq ."

step "Get todo #1"
run "$TOCLI --spec $SPEC --output json todos get --id 1 | jq ."

# ─── Write (require auth) ───
step "Create todo WITHOUT auth (should fail 401)"
run "$TOCLI --spec $SPEC --output json todos create --title 'Test without auth' 2>&1 || true"

step "Create todo WITH auth"
run "$TOCLI --spec $SPEC --output json --token $TOKEN todos create --title 'Deploy tocli to npm' --description 'Publish v0.1.0' --priority high --tags 'work,release' | jq ."

step "Update todo #1 to done"
run "$TOCLI --spec $SPEC --output json --token $TOKEN todos update --id 1 --status done | jq ."

step "Delete todo #4"
run "$TOCLI --spec $SPEC --output json --token $TOKEN todos delete --id 4 2>&1 || echo '(204 No Content — deleted)'"

# ─── Verify ───
step "Final state (table)"
run "$TOCLI --spec $SPEC --output table todos list"

step "Done todos"
run "$TOCLI --spec $SPEC --output table todos list --status done"

step "All tags"
run "$TOCLI --spec $SPEC --output json tags list | jq ."

# ─── Help ───
step "Dynamic help: root"
run "$TOCLI --spec $SPEC --help"

step "Dynamic help: todos"
run "$TOCLI --spec $SPEC todos --help"

step "Dynamic help: todos create"
run "$TOCLI --spec $SPEC todos create --help"

# ─── Verbose ───
step "Verbose mode"
run "$TOCLI --spec $SPEC --output json --verbose todos get --id 1 2>&1 | head -10"

echo ""
echo -e "${G}═══════════════════════════════════════════════════════════${R}"
echo -e "${G}  Demo complete!${R}"
echo -e "${G}═══════════════════════════════════════════════════════════${R}"
