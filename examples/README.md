# MCP-C Examples

## What each example proves

### `todo-api/` — Runtime works (human test)

Proves that mcp-c can read an OpenAPI spec and turn it into a working CLI with discovery, auth, CRUD, and output formatting.

**What it tests:**
- Parser reads OpenAPI 3.x correctly
- Discovery protocol outputs valid JSON in 3 phases
- Dynamic commands are generated from spec
- HTTP executor makes real API calls
- Auth (bearer token) works
- Output formats (json, table, envelope) work

**What it does NOT test:**
- Whether an AI agent can actually use the protocol
- Whether progressive discovery saves context in practice
- Whether the envelope format helps agents make better decisions

```bash
# Run the demo
bash examples/todo-api/demo.sh
```

---

### `agent-test/` — Protocol works for AI agents (the real test)

This is the test that matters. It gives a real AI agent (Claude) a task and measures how much context mcp-c consumes compared to alternatives.

**The task:** "List pending todos from the API, find the highest priority one, and mark it as done."

**Three approaches tested:**

| Approach | How the agent discovers the API | How it executes |
|---|---|---|
| **MCP-style** | All tool schemas loaded upfront | JSON-RPC tool call |
| **CLI raw** | Reads `--help` text | Runs shell command |
| **MCP-C** | Progressive discovery (3 phases) | Runs shell command |

**What it measures:**
- **Input tokens**: how much context the agent consumes for discovery + invocation
- **Output tokens**: how much response data enters the context
- **Accuracy**: did the agent complete the task correctly?
- **Roundtrips**: how many calls did the agent need?

**How to run:**

```bash
# Start the todo API server
node examples/todo-api/server.mjs &

# Run the agent test (requires Claude API access via `claude` CLI)
bash examples/agent-test/run.sh

# Stop the server
kill %1
```

**How it works:**

1. Starts the Todo API server (same as todo-api example)
2. Runs Claude via `claude -p` with three different system prompts:
   - **MCP-style**: all tool schemas injected in system prompt
   - **CLI raw**: told to use `curl` and read help text
   - **MCP-C**: told to use `mcp-c --discover` progressively
3. Each run gets the same task
4. Measures tokens from `--output-format json` metadata
5. Compares results

**Expected outcome:**

The MCP-style approach should use the most input tokens (all schemas loaded upfront). CLI raw should use the fewest input tokens but may need more roundtrips. MCP-C should be in between on input tokens but produce the most compact output via envelope format.

The point is not that mcp-c "wins" every metric — it's that it offers **structured discovery at CLI-level cost**, which neither MCP nor raw CLI can do alone.
