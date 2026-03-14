/**
 * Simple in-memory Todo API server for testing tocli.
 *
 * Run:   node examples/todo-api/server.mjs
 * Stops: Ctrl+C (or auto-stops after 5 minutes)
 */

import http from "node:http";

const AUTH_TOKEN = "test-token-123";

let nextId = 1;
const todos = [
  { id: nextId++, title: "Buy groceries", description: "Milk, eggs, bread", status: "pending", priority: "high", tags: ["shopping", "personal"], createdAt: "2025-01-10T09:00:00Z" },
  { id: nextId++, title: "Write README", description: "Document the tocli protocol", status: "done", priority: "high", tags: ["work", "docs"], createdAt: "2025-01-10T10:00:00Z" },
  { id: nextId++, title: "Fix login bug", description: "Users can't login on mobile", status: "pending", priority: "high", tags: ["work", "bug"], createdAt: "2025-01-10T11:00:00Z" },
  { id: nextId++, title: "Call dentist", description: "Schedule cleaning", status: "pending", priority: "low", tags: ["personal", "health"], createdAt: "2025-01-10T12:00:00Z" },
  { id: nextId++, title: "Review PR #42", description: "Performance improvements", status: "pending", priority: "medium", tags: ["work", "review"], createdAt: "2025-01-10T13:00:00Z" },
  { id: nextId++, title: "Update dependencies", description: "Run npm audit fix", status: "done", priority: "medium", tags: ["work", "maintenance"], createdAt: "2025-01-10T14:00:00Z" },
  { id: nextId++, title: "Plan sprint", description: "Next week sprint planning", status: "pending", priority: "medium", tags: ["work", "planning"], createdAt: "2025-01-10T15:00:00Z" },
];

function parseBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try { resolve(JSON.parse(body)); }
      catch { resolve({}); }
    });
  });
}

function checkAuth(req) {
  const auth = req.headers.authorization;
  return auth === `Bearer ${AUTH_TOKEN}`;
}

function json(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost:4000");
  const path = url.pathname;
  const method = req.method;

  // GET /todos
  if (method === "GET" && path === "/todos") {
    let filtered = [...todos];
    const status = url.searchParams.get("status");
    if (status && status !== "all") {
      filtered = filtered.filter((t) => t.status === status);
    }
    const limit = parseInt(url.searchParams.get("limit") || "20");
    filtered = filtered.slice(0, limit);
    return json(res, 200, filtered);
  }

  // POST /todos
  if (method === "POST" && path === "/todos") {
    if (!checkAuth(req)) return json(res, 401, { error: "Unauthorized. Use --token test-token-123" });
    const body = await parseBody(req);
    if (!body.title) return json(res, 400, { error: "title is required" });
    const todo = {
      id: nextId++,
      title: body.title,
      description: body.description || "",
      status: "pending",
      priority: body.priority || "medium",
      tags: body.tags ? body.tags.split(",").map((t) => t.trim()) : [],
      createdAt: new Date().toISOString(),
    };
    todos.push(todo);
    return json(res, 201, todo);
  }

  // GET /todos/:id
  const todoMatch = path.match(/^\/todos\/(\d+)$/);
  if (method === "GET" && todoMatch) {
    const id = parseInt(todoMatch[1]);
    const todo = todos.find((t) => t.id === id);
    if (!todo) return json(res, 404, { error: `Todo #${id} not found` });
    return json(res, 200, todo);
  }

  // PUT /todos/:id
  if (method === "PUT" && todoMatch) {
    if (!checkAuth(req)) return json(res, 401, { error: "Unauthorized" });
    const id = parseInt(todoMatch[1]);
    const todo = todos.find((t) => t.id === id);
    if (!todo) return json(res, 404, { error: `Todo #${id} not found` });
    const body = await parseBody(req);
    if (body.title) todo.title = body.title;
    if (body.description) todo.description = body.description;
    if (body.status) todo.status = body.status;
    if (body.priority) todo.priority = body.priority;
    return json(res, 200, todo);
  }

  // DELETE /todos/:id
  if (method === "DELETE" && todoMatch) {
    if (!checkAuth(req)) return json(res, 401, { error: "Unauthorized" });
    const id = parseInt(todoMatch[1]);
    const idx = todos.findIndex((t) => t.id === id);
    if (idx === -1) return json(res, 404, { error: `Todo #${id} not found` });
    todos.splice(idx, 1);
    res.writeHead(204);
    return res.end();
  }

  // GET /tags
  if (method === "GET" && path === "/tags") {
    const allTags = [...new Set(todos.flatMap((t) => t.tags))].sort();
    return json(res, 200, allTags);
  }

  json(res, 404, { error: "Not found" });
});

server.listen(4000, () => {
  console.log("Todo API running at http://localhost:4000");
  console.log("Auth token: test-token-123");
  console.log("Press Ctrl+C to stop\n");
});

// Auto-stop after 5 minutes
setTimeout(() => { server.close(); process.exit(0); }, 5 * 60 * 1000);
