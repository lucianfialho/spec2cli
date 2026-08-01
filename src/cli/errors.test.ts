import { describe, it, expect, vi, afterEach } from "vitest";
import { EXIT, classifyStatus, classifyThrown, fail, failMissingInput } from "./errors.js";
import type { Param } from "../parser/types.js";

afterEach(() => vi.restoreAllMocks());

/** Runs a function that exits, returning what it printed and the code it used. */
function trap(run: () => void) {
  const out: string[] = [];
  const err: string[] = [];
  const log = vi.spyOn(console, "log").mockImplementation((m) => void out.push(String(m)));
  const error = vi.spyOn(console, "error").mockImplementation((m) => void err.push(String(m)));
  const exit = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
    throw new Error(`exit:${code}`);
  }) as never);

  let code: number | undefined;
  try {
    run();
  } catch (e) {
    const m = /^exit:(\d+)$/.exec((e as Error).message);
    if (!m) throw e;
    code = Number(m[1]);
  }

  log.mockRestore();
  error.mockRestore();
  exit.mockRestore();
  return { code, stdout: out.join("\n"), stderr: err.join("\n") };
}

describe("classifyStatus", () => {
  it.each([
    [401, "auth"],
    [403, "auth"],
    [404, "not_found"],
    [429, "rate_limited"],
    [418, "client_error"],
    [500, "server_error"],
    [503, "server_error"],
  ])("maps %i to %s", (status, kind) => {
    expect(classifyStatus(status)).toBe(kind);
  });
});

describe("classifyThrown", () => {
  it("recognises a transport failure", () => {
    expect(classifyThrown(new Error("fetch failed"))).toBe("network");
    expect(classifyThrown(new Error("connect ECONNREFUSED 127.0.0.1:9"))).toBe("network");
  });

  it("does not claim an ordinary bug is a network problem", () => {
    expect(classifyThrown(new TypeError("x is not a function"))).toBe("generic");
  });
});

describe("fail", () => {
  it("exits with the code matching the kind", () => {
    expect(trap(() => fail("json", { kind: "rate_limited", message: "slow down" })).code).toBe(EXIT.rate_limited);
    expect(trap(() => fail("json", { kind: "auth", message: "nope" })).code).toBe(EXIT.auth);
  });

  it("marks retryable kinds so a caller can tell them apart", () => {
    const retry = JSON.parse(trap(() => fail("json", { kind: "server_error", message: "boom" })).stdout);
    const fatal = JSON.parse(trap(() => fail("json", { kind: "auth", message: "nope" })).stdout);
    expect(retry.error.retryable).toBe(true);
    expect(fatal.error.retryable).toBe(false);
  });

  it("puts the payload on stdout under --output json", () => {
    const r = trap(() => fail("json", { kind: "not_found", message: "gone", status: 404, body: { detail: "x" } }));
    expect(r.stderr).toBe("");
    expect(JSON.parse(r.stdout).error).toMatchObject({ kind: "not_found", status: 404, body: { detail: "x" } });
  });

  it("writes prose to stderr in human mode", () => {
    const r = trap(() => fail("pretty", { kind: "not_found", message: "gone" }));
    expect(r.stdout).toBe("");
    expect(r.stderr).toContain("gone");
  });
});

describe("failMissingInput", () => {
  const params: Param[] = [
    { name: "name", in: "body", type: "string", required: true, description: "what to look up" },
    { name: "kind", in: "query", type: "string", required: true, description: "", enum: ["package", "option"] },
  ];

  it("reports every missing input at once, not just the first", () => {
    const doc = JSON.parse(trap(() => failMissingInput("json", "nixos info", params)).stdout);
    expect(doc.status).toBe("input_required");
    expect(doc.missing.map((m: any) => m.name)).toEqual(["name", "kind"]);
  });

  it("carries enough schema for the caller to fill them in", () => {
    const doc = JSON.parse(trap(() => failMissingInput("json", "nixos info", params)).stdout);
    expect(doc.missing[0]).toMatchObject({ type: "string", in: "body", desc: "what to look up" });
    expect(doc.missing[1].enum).toEqual(["package", "option"]);
  });

  it("exits with the usage code", () => {
    expect(trap(() => failMissingInput("json", "nixos info", params)).code).toBe(EXIT.usage);
  });

  it("names the flags in human mode", () => {
    const r = trap(() => failMissingInput("pretty", "nixos info", params));
    expect(r.stderr).toContain("--name <string>");
    expect(r.stderr).toContain("--kind <string>");
  });
});
