import { vi } from "vitest";
import { parse as fromYaml } from "yaml";
import path from "node:path";
import { printAgentHelp, type AgentHelpSelector } from "./agent-help.js";
import { extractOperations } from "../parser/extractor.js";
import { loadSpec } from "../parser/loader.js";
import type { OpenAPISpec, OperationGroup } from "../parser/types.js";

const FIXTURE = path.resolve("test/fixtures/petstore.yaml");

let loaded: { spec: OpenAPISpec; groups: OperationGroup[] } | undefined;

export async function fixture() {
  if (!loaded) {
    const spec = await loadSpec(FIXTURE);
    loaded = { spec, groups: extractOperations(spec) };
  }
  return loaded;
}

/** Runs printAgentHelp against the petstore fixture and parses what it wrote. */
export async function help(selector: AgentHelpSelector = {}) {
  const { spec, groups } = await fixture();
  return capture(() => printAgentHelp(groups, spec, selector));
}

/** Captures console.log output from a printAgentHelp call and parses it as YAML. */
export function capture(run: () => void) {
  const spy = vi.spyOn(console, "log").mockImplementation(() => {});
  run();
  const raw = spy.mock.calls.map((c) => c[0]).join("\n");
  spy.mockRestore();
  return { raw, doc: fromYaml(raw) as Record<string, any> };
}
