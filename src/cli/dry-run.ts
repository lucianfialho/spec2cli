import { buildRequest, maskAuthHeaders } from "../executor/request.js";
import type { Operation } from "../parser/types.js";
import type { RuntimeConfig } from "../executor/types.js";

/**
 * Previews the request an operation would send.
 *
 * Credentials are masked by default. This output is what people paste into bug
 * reports and chat, and the curl line is built to be copy-pasteable — printing
 * a live token there is the worst place to do it. --reveal opts back in.
 */
export function printDryRun(
  op: Operation,
  params: Record<string, unknown>,
  config: RuntimeConfig
): void {
  const req = buildRequest(op, params, config.auth, config.baseUrl);
  const reveal = config.revealSecrets === true;
  const headers = reveal ? req.headers : maskAuthHeaders(req.headers, config.auth);
  const curl = buildCurl(req.method, req.url, headers, req.body);

  if (config.output === "json") {
    console.log(
      JSON.stringify(
        {
          method: req.method,
          url: req.url,
          headers,
          ...(req.body ? { body: req.body } : {}),
          curl,
          secrets_masked: !reveal,
        },
        null,
        2
      )
    );
    return;
  }

  console.log(`${req.method} ${req.url}`);
  for (const [name, value] of Object.entries(headers)) {
    console.log(`${name}: ${value}`);
  }
  if (req.body) {
    console.log("");
    console.log(JSON.stringify(req.body, null, 2));
  }

  console.log("");
  console.log(curl);

  if (!reveal && differs(req.headers, headers)) {
    console.log("");
    console.log("# credentials masked — re-run with --reveal to emit them literally");
  }
}

function buildCurl(
  method: string,
  url: string,
  headers: Record<string, string>,
  body?: Record<string, unknown>
): string {
  let curl = `curl -X ${method} '${url}'`;
  for (const [name, value] of Object.entries(headers)) {
    curl += ` \\\n  -H '${name}: ${value}'`;
  }
  if (body) curl += ` \\\n  -d '${JSON.stringify(body)}'`;
  return curl;
}

function differs(a: Record<string, string>, b: Record<string, string>): boolean {
  return Object.keys(a).some((k) => a[k] !== b[k]);
}
