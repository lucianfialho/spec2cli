/**
 * Large Project Management API server (56 endpoints) for testing mcp-c at scale.
 *
 * Run:   node examples/large-api/server.mjs
 * Port:  4001
 */

import http from "node:http";

const AUTH_TOKEN = "pm-token-456";

let nextId = 100;

const projects = [
  { id: 1, name: "MCP-C Protocol", description: "Context-efficient CLI protocol", status: "active", createdAt: "2025-01-01T00:00:00Z" },
  { id: 2, name: "Website Redesign", description: "New company website", status: "active", createdAt: "2025-01-05T00:00:00Z" },
  { id: 3, name: "Mobile App v2", description: "React Native rewrite", status: "active", createdAt: "2025-01-10T00:00:00Z" },
];

const tasks = [
  { id: 1, projectId: 1, title: "Write protocol spec", description: "Define discovery phases", status: "done", priority: "critical", assignee: "lucian", labels: ["docs", "core"], milestone: 1, dueDate: "2025-02-01", createdAt: "2025-01-02" },
  { id: 2, projectId: 1, title: "Implement parser", description: "OpenAPI 3.x parser", status: "done", priority: "high", assignee: "lucian", labels: ["core"], milestone: 1, dueDate: "2025-02-10", createdAt: "2025-01-03" },
  { id: 3, projectId: 1, title: "Build benchmark", description: "Compare MCP vs mcp-c tokens", status: "done", priority: "high", assignee: "lucian", labels: ["benchmark"], milestone: 1, dueDate: "2025-02-15", createdAt: "2025-01-04" },
  { id: 4, projectId: 1, title: "Bridge for existing CLIs", description: "Wrap gh, aws, etc", status: "open", priority: "high", assignee: null, labels: ["feature", "bridge"], milestone: 2, dueDate: "2025-03-01", createdAt: "2025-01-05" },
  { id: 5, projectId: 1, title: "Publish to npm", description: "npm publish mcp-c", status: "open", priority: "critical", assignee: "lucian", labels: ["release"], milestone: 2, dueDate: "2025-02-20", createdAt: "2025-01-06" },
  { id: 6, projectId: 2, title: "Design mockups", description: "Figma designs for homepage", status: "in_progress", priority: "high", assignee: "designer", labels: ["design"], milestone: null, dueDate: "2025-02-01", createdAt: "2025-01-06" },
  { id: 7, projectId: 2, title: "Implement hero section", description: "Above the fold content", status: "open", priority: "medium", assignee: null, labels: ["frontend"], milestone: null, dueDate: "2025-02-15", createdAt: "2025-01-07" },
  { id: 8, projectId: 2, title: "SEO audit", description: "Technical SEO review", status: "blocked", priority: "low", assignee: null, labels: ["seo"], milestone: null, dueDate: null, createdAt: "2025-01-08" },
  { id: 9, projectId: 3, title: "Set up React Native project", description: "Expo + TypeScript", status: "done", priority: "high", assignee: "mobile-dev", labels: ["setup"], milestone: null, dueDate: "2025-01-20", createdAt: "2025-01-11" },
  { id: 10, projectId: 3, title: "Auth flow", description: "Login/signup with biometrics", status: "in_progress", priority: "critical", assignee: "mobile-dev", labels: ["auth", "mobile"], milestone: null, dueDate: "2025-02-01", createdAt: "2025-01-12" },
  { id: 11, projectId: 3, title: "Push notifications", description: "FCM + APNs integration", status: "open", priority: "medium", assignee: null, labels: ["mobile", "notifications"], milestone: null, dueDate: "2025-03-01", createdAt: "2025-01-13" },
  { id: 12, projectId: 1, title: "Fix duplicate params bug", description: "Commander conflicts on specs with repeated params", status: "done", priority: "medium", assignee: "lucian", labels: ["bug"], milestone: 1, dueDate: null, createdAt: "2025-01-14" },
];

const milestones = [
  { id: 1, projectId: 1, title: "v0.1.0 - MVP", description: "Core protocol + runtime", status: "open", dueDate: "2025-02-15" },
  { id: 2, projectId: 1, title: "v0.2.0 - Bridge", description: "CLI bridge + npm publish", status: "open", dueDate: "2025-03-15" },
];

function parseBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => { try { resolve(JSON.parse(body)); } catch { resolve({}); } });
  });
}

function checkAuth(req) {
  return req.headers.authorization === `Bearer ${AUTH_TOKEN}`;
}

function json(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost:4001");
  const path = url.pathname;
  const method = req.method;
  const qs = (k) => url.searchParams.get(k);

  // ─── Projects ───
  if (method === "GET" && path === "/projects") {
    let list = [...projects];
    const status = qs("status");
    if (status && status !== "all") list = list.filter((p) => p.status === status);
    return json(res, 200, list);
  }
  if (method === "POST" && path === "/projects") {
    if (!checkAuth(req)) return json(res, 401, { error: "Unauthorized" });
    const body = await parseBody(req);
    const p = { id: nextId++, ...body, status: "active", createdAt: new Date().toISOString() };
    projects.push(p);
    return json(res, 201, p);
  }

  let m;

  // /projects/:id
  m = path.match(/^\/projects\/(\d+)$/);
  if (m) {
    const id = parseInt(m[1]);
    const p = projects.find((x) => x.id === id);
    if (!p) return json(res, 404, { error: `Project #${id} not found` });
    if (method === "GET") return json(res, 200, p);
    if (method === "PUT") {
      if (!checkAuth(req)) return json(res, 401, { error: "Unauthorized" });
      const body = await parseBody(req);
      Object.assign(p, body);
      return json(res, 200, p);
    }
    if (method === "DELETE") {
      if (!checkAuth(req)) return json(res, 401, { error: "Unauthorized" });
      projects.splice(projects.indexOf(p), 1);
      res.writeHead(204); return res.end();
    }
  }

  // /projects/:id/archive
  m = path.match(/^\/projects\/(\d+)\/archive$/);
  if (m && method === "POST") {
    if (!checkAuth(req)) return json(res, 401, { error: "Unauthorized" });
    const p = projects.find((x) => x.id === parseInt(m[1]));
    if (!p) return json(res, 404, { error: "Not found" });
    p.status = "archived";
    return json(res, 200, p);
  }

  // ─── Tasks ───
  // /projects/:id/tasks
  m = path.match(/^\/projects\/(\d+)\/tasks$/);
  if (m) {
    const pid = parseInt(m[1]);
    if (method === "GET") {
      let list = tasks.filter((t) => t.projectId === pid);
      const status = qs("status"); if (status) list = list.filter((t) => t.status === status);
      const priority = qs("priority"); if (priority) list = list.filter((t) => t.priority === priority);
      const assignee = qs("assignee"); if (assignee) list = list.filter((t) => t.assignee === assignee);
      const limit = parseInt(qs("limit") || "50"); list = list.slice(0, limit);
      return json(res, 200, list);
    }
    if (method === "POST") {
      if (!checkAuth(req)) return json(res, 401, { error: "Unauthorized" });
      const body = await parseBody(req);
      const t = { id: nextId++, projectId: pid, status: "open", priority: body.priority || "medium", assignee: body.assignee || null, labels: body.labels ? body.labels.split(",") : [], ...body, createdAt: new Date().toISOString() };
      tasks.push(t);
      return json(res, 201, t);
    }
  }

  // /projects/:id/tasks/:tid
  m = path.match(/^\/projects\/(\d+)\/tasks\/(\d+)$/);
  if (m) {
    const t = tasks.find((x) => x.id === parseInt(m[2]) && x.projectId === parseInt(m[1]));
    if (!t) return json(res, 404, { error: "Task not found" });
    if (method === "GET") return json(res, 200, t);
    if (method === "PUT") {
      if (!checkAuth(req)) return json(res, 401, { error: "Unauthorized" });
      const body = await parseBody(req);
      Object.assign(t, body);
      return json(res, 200, t);
    }
    if (method === "DELETE") {
      if (!checkAuth(req)) return json(res, 401, { error: "Unauthorized" });
      tasks.splice(tasks.indexOf(t), 1);
      res.writeHead(204); return res.end();
    }
  }

  // /tasks/search
  if (method === "GET" && path === "/tasks/search") {
    const q = (qs("q") || "").toLowerCase();
    let list = tasks.filter((t) => t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q));
    const status = qs("status"); if (status) list = list.filter((t) => t.status === status);
    return json(res, 200, list);
  }

  // ─── Users ───
  if (method === "GET" && path === "/users") return json(res, 200, [
    { id: 1, username: "lucian", email: "lucian@example.com", role: "admin", displayName: "Lucian" },
    { id: 2, username: "designer", email: "designer@example.com", role: "member", displayName: "Designer" },
    { id: 3, username: "mobile-dev", email: "mobile@example.com", role: "member", displayName: "Mobile Dev" },
  ]);
  if (method === "GET" && path === "/users/me") {
    if (!checkAuth(req)) return json(res, 401, { error: "Unauthorized" });
    return json(res, 200, { id: 1, username: "lucian", role: "admin" });
  }

  // ─── Milestones ───
  m = path.match(/^\/projects\/(\d+)\/milestones$/);
  if (m && method === "GET") {
    return json(res, 200, milestones.filter((ms) => ms.projectId === parseInt(m[1])));
  }

  // ─── Reports ───
  m = path.match(/^\/projects\/(\d+)\/reports\/summary$/);
  if (m && method === "GET") {
    const pid = parseInt(m[1]);
    const pt = tasks.filter((t) => t.projectId === pid);
    return json(res, 200, {
      project: projects.find((p) => p.id === pid)?.name,
      total: pt.length,
      open: pt.filter((t) => t.status === "open").length,
      in_progress: pt.filter((t) => t.status === "in_progress").length,
      done: pt.filter((t) => t.status === "done").length,
      blocked: pt.filter((t) => t.status === "blocked").length,
    });
  }

  if (method === "GET" && path === "/reports/overdue") {
    if (!checkAuth(req)) return json(res, 401, { error: "Unauthorized" });
    const today = new Date().toISOString().slice(0, 10);
    const overdue = tasks.filter((t) => t.dueDate && t.dueDate < today && t.status !== "done");
    return json(res, 200, overdue);
  }

  // ─── Catch-all ───
  json(res, 404, { error: "Not found" });
});

server.listen(4001, () => {
  console.log("Project Management API running at http://localhost:4001");
  console.log("Auth token: pm-token-456");
  console.log("56 endpoints | 3 projects | 12 tasks");
  console.log("Press Ctrl+C to stop\n");
});

setTimeout(() => { server.close(); process.exit(0); }, 10 * 60 * 1000);
