import { describe, it, expect } from "vitest";
import { buildRequest } from "./request.js";
import type { Operation } from "../parser/types.js";
import type { AuthConfig } from "./types.js";

const NO_AUTH: AuthConfig = { type: "none", value: "" };

function op(overrides: Partial<Operation> = {}): Operation {
  return {
    id: "listItems",
    method: "GET",
    path: "/items",
    summary: "",
    description: "",
    params: [],
    bodyRequired: false,
    security: [],
    ...overrides,
  };
}

describe("query defaults hidden in a URL fragment", () => {
  it("sends them instead of dropping them", () => {
    // `#` makes URL treat the rest as a fragment, which never reaches the server.
    const req = buildRequest(op({ path: "/items#status=active" }), {}, NO_AUTH, "http://api.test");

    expect(req.url).toContain("status=active");
    expect(req.url).not.toContain("#");
  });

  it("lets an explicit parameter win over the fragment", () => {
    const operation = op({
      path: "/items#status=active",
      params: [{ name: "status", in: "query", type: "string", required: false, description: "" }],
    });

    expect(buildRequest(operation, { status: "archived" }, NO_AUTH, "http://api.test").url)
      .toContain("status=archived");
  });

  it("leaves a genuine fragment alone", () => {
    const req = buildRequest(op({ path: "/docs#section" }), {}, NO_AUTH, "http://api.test");
    expect(req.url).toContain("#section");
  });
});
