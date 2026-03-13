import { describe, it, expect } from "vitest";
import { formatOutput, buildEnvelope } from "./formatters.js";

describe("formatOutput", () => {
  const sampleArray = [
    { id: 1, name: "Rex", status: "available" },
    { id: 2, name: "Luna", status: "pending" },
    { id: 3, name: "Max", status: "sold" },
  ];

  it("json mode outputs compact JSON", () => {
    const result = formatOutput(sampleArray, { format: "json" });
    expect(result).toBe(JSON.stringify(sampleArray));
    expect(result).not.toContain("\n");
  });

  it("pretty mode outputs indented JSON", () => {
    const result = formatOutput(sampleArray, { format: "pretty" });
    expect(result).toContain("\n");
    expect(result).toContain("Rex");
  });

  it("quiet mode outputs nothing", () => {
    const result = formatOutput(sampleArray, { format: "quiet" });
    expect(result).toBe("");
  });

  it("table mode formats arrays as columns", () => {
    const result = formatOutput(sampleArray, { format: "table" });
    expect(result).toContain("id");
    expect(result).toContain("name");
    expect(result).toContain("status");
    expect(result).toContain("Rex");
    expect(result).toContain("Luna");
    const lines = result.split("\n");
    expect(lines.length).toBe(5); // header + separator + 3 rows
  });

  it("table mode handles empty arrays", () => {
    const result = formatOutput([], { format: "table" });
    expect(result).toBe("(empty)");
  });

  it("envelope mode wraps in summary + data + meta", () => {
    const result = formatOutput(sampleArray, { format: "envelope" });
    const parsed = JSON.parse(result);
    expect(parsed.summary).toContain("3 items");
    expect(parsed.data).toHaveLength(3);
    expect(parsed._meta.count).toBe(3);
    expect(parsed._meta.truncated).toBe(false);
  });

  it("envelope mode respects maxItems", () => {
    const result = formatOutput(sampleArray, { format: "envelope", maxItems: 2 });
    const parsed = JSON.parse(result);
    expect(parsed.summary).toContain("Showing first 2");
    expect(parsed.data).toHaveLength(2);
    expect(parsed._meta.count).toBe(2);
    expect(parsed._meta.total).toBe(3);
    expect(parsed._meta.truncated).toBe(true);
  });
});

describe("buildEnvelope", () => {
  it("generates summary for arrays", () => {
    const env = buildEnvelope([1, 2, 3]);
    expect(env.summary).toBe("Found 3 items.");
    expect(env._meta.count).toBe(3);
  });

  it("generates summary for objects with id/name", () => {
    const env = buildEnvelope({ id: 42, name: "Rex", status: "available" });
    expect(env.summary).toContain("#42");
    expect(env.summary).toContain("Rex");
    expect(env.summary).toContain("available");
  });

  it("generates fallback summary for plain objects", () => {
    const env = buildEnvelope({ foo: "bar", baz: 1 });
    expect(env.summary).toContain("2 fields");
  });

  it("truncates arrays with maxItems", () => {
    const env = buildEnvelope([1, 2, 3, 4, 5], 3);
    expect(env.data).toEqual([1, 2, 3]);
    expect(env._meta.truncated).toBe(true);
    expect(env._meta.total).toBe(5);
  });

  it("does not truncate when under maxItems", () => {
    const env = buildEnvelope([1, 2], 5);
    expect(env.data).toEqual([1, 2]);
    expect(env._meta.truncated).toBe(false);
  });
});
