import { describe, it, expect } from "vitest";

describe("project setup", () => {
  it("typescript compiles and vitest runs", () => {
    expect(1 + 1).toBe(2);
  });

  it("can import parser types", async () => {
    const types = await import("./parser/types.js");
    expect(types).toBeDefined();
  });
});
