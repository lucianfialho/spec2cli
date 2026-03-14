import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import { loadSpec } from "../../src/parser/loader.js";
import { extractOperations } from "../../src/parser/extractor.js";
import { executeRequest } from "../../src/executor/http.js";
import { formatOutput } from "../../src/output/formatters.js";
import type { AuthConfig } from "../../src/executor/types.js";
import path from "node:path";

const SPEC_PATH = path.resolve("examples/todo-api/openapi.yaml");
const BASE_URL = "http://localhost:4455";
const TOKEN = "test-token-123";
const NO_AUTH: AuthConfig = { type: "none", value: "" };
const BEARER: AuthConfig = { type: "bearer", value: TOKEN };

let server: http.Server;
const todos: Array<Record<string, unknown>> = [];
let nextId = 1;

beforeAll(async () => {
  todos.length = 0;
  nextId = 1;
  todos.push(
    { id: nextId++, title: "Buy groceries", status: "pending", priority: "high", tags: ["shopping"] },
    { id: nextId++, title: "Write docs", status: "done", priority: "medium", tags: ["work"] },
    { id: nextId++, title: "Fix bug", status: "pending", priority: "high", tags: ["work", "bug"] },
  );

  server = http.createServer((req, res) => {
    const url = new URL(req.url!, BASE_URL);
    const p = url.pathname;
    const json = (s: number, d: unknown) => {
      res.writeHead(s, { "Content-Type": "application/json" });
      res.end(JSON.stringify(d));
    };

    if (req.method === "GET" && p === "/todos") {
      let list = [...todos];
      const status = url.searchParams.get("status");
      if (status && status !== "all") list = list.filter((t) => t.status === status);
      return json(200, list);
    }

    if (req.method === "GET" && p === "/tags") {
      return json(200, [...new Set(todos.flatMap((t) => t.tags as string[]))].sort());
    }

    const m = p.match(/^\/todos\/(\d+)$/);
    if (m) {
      const id = parseInt(m[1]);
      const todo = todos.find((t) => t.id === id);
      if (!todo) return json(404, { error: "not found" });

      if (req.method === "GET") return json(200, todo);
      if (req.method === "PUT") {
        if (req.headers.authorization !== `Bearer ${TOKEN}`) return json(401, { error: "unauthorized" });
        let body = "";
        req.on("data", (c: Buffer) => (body += c));
        req.on("end", () => { Object.assign(todo, JSON.parse(body)); json(200, todo); });
        return;
      }
      if (req.method === "DELETE") {
        if (req.headers.authorization !== `Bearer ${TOKEN}`) return json(401, { error: "unauthorized" });
        todos.splice(todos.indexOf(todo), 1);
        res.writeHead(204);
        return res.end();
      }
    }

    if (req.method === "POST" && p === "/todos") {
      if (req.headers.authorization !== `Bearer ${TOKEN}`) return json(401, { error: "unauthorized" });
      let body = "";
      req.on("data", (c: Buffer) => (body += c));
      req.on("end", () => {
        const parsed = JSON.parse(body);
        const todo = { id: nextId++, status: "pending", priority: "medium", tags: [], ...parsed };
        todos.push(todo);
        json(201, todo);
      });
      return;
    }

    json(404, { error: "not found" });
  });

  await new Promise<void>((resolve) => server.listen(4455, resolve));
});

afterAll(() => {
  server?.close();
});

describe("e2e: spec + parser + executor + output against real server", () => {
  it("loads the todo API spec", async () => {
    const spec = await loadSpec(SPEC_PATH);
    expect(spec.openapi).toBe("3.0.3");
    expect(spec.info.title).toBe("Todo API");
  });

  it("extracts groups matching spec tags", async () => {
    const spec = await loadSpec(SPEC_PATH);
    const groups = extractOperations(spec);
    expect(groups.map((g) => g.tag).sort()).toEqual(["tags", "todos"]);
  });

  it("lists todos", async () => {
    const spec = await loadSpec(SPEC_PATH);
    const groups = extractOperations(spec);
    const op = groups.find((g) => g.tag === "todos")!.operations.find((o) => o.id === "listTodos")!;

    const result = await executeRequest(op, {}, NO_AUTH, BASE_URL);
    expect(result.status).toBe(200);
    expect((result.data as unknown[]).length).toBe(3);
  });

  it("filters by query param", async () => {
    const spec = await loadSpec(SPEC_PATH);
    const groups = extractOperations(spec);
    const op = groups.find((g) => g.tag === "todos")!.operations.find((o) => o.id === "listTodos")!;

    const result = await executeRequest(op, { status: "pending" }, NO_AUTH, BASE_URL);
    const data = result.data as Array<{ status: string }>;
    expect(data.every((t) => t.status === "pending")).toBe(true);
    expect(data.length).toBe(2);
  });

  it("gets single todo by ID", async () => {
    const spec = await loadSpec(SPEC_PATH);
    const groups = extractOperations(spec);
    const op = groups.find((g) => g.tag === "todos")!.operations.find((o) => o.id === "getTodo")!;

    const result = await executeRequest(op, { id: 1 }, NO_AUTH, BASE_URL);
    expect(result.status).toBe(200);
    expect((result.data as { title: string }).title).toBe("Buy groceries");
  });

  it("returns 404 for missing todo", async () => {
    const spec = await loadSpec(SPEC_PATH);
    const groups = extractOperations(spec);
    const op = groups.find((g) => g.tag === "todos")!.operations.find((o) => o.id === "getTodo")!;

    const result = await executeRequest(op, { id: 999 }, NO_AUTH, BASE_URL);
    expect(result.status).toBe(404);
  });

  it("rejects create without auth", async () => {
    const spec = await loadSpec(SPEC_PATH);
    const groups = extractOperations(spec);
    const op = groups.find((g) => g.tag === "todos")!.operations.find((o) => o.id === "createTodo")!;

    const result = await executeRequest(op, { title: "test" }, NO_AUTH, BASE_URL);
    expect(result.status).toBe(401);
  });

  it("creates todo with auth", async () => {
    const spec = await loadSpec(SPEC_PATH);
    const groups = extractOperations(spec);
    const op = groups.find((g) => g.tag === "todos")!.operations.find((o) => o.id === "createTodo")!;

    const result = await executeRequest(op, { title: "E2E todo" }, BEARER, BASE_URL);
    expect(result.status).toBe(201);
    expect((result.data as { title: string }).title).toBe("E2E todo");
  });

  it("updates todo with auth", async () => {
    const spec = await loadSpec(SPEC_PATH);
    const groups = extractOperations(spec);
    const op = groups.find((g) => g.tag === "todos")!.operations.find((o) => o.id === "updateTodo")!;

    const result = await executeRequest(op, { id: 1, status: "done" }, BEARER, BASE_URL);
    expect(result.status).toBe(200);
    expect((result.data as { status: string }).status).toBe("done");
  });

  it("lists tags", async () => {
    const spec = await loadSpec(SPEC_PATH);
    const groups = extractOperations(spec);
    const op = groups.find((g) => g.tag === "tags")!.operations.find((o) => o.id === "listTags")!;

    const result = await executeRequest(op, {}, NO_AUTH, BASE_URL);
    expect(result.status).toBe(200);
    expect(result.data).toContain("work");
  });

  it("formats output as JSON", () => {
    const result = formatOutput([{ id: 1 }], { format: "json" });
    expect(result).toBe('[{"id":1}]');
  });

  it("formats output as table", () => {
    const result = formatOutput([{ id: 1, name: "Rex" }], { format: "table" });
    expect(result).toContain("id");
    expect(result).toContain("Rex");
  });

  it("truncates with maxItems", () => {
    const data = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const result = JSON.parse(formatOutput(data, { format: "json", maxItems: 2 }));
    expect(result).toHaveLength(2);
  });
});
