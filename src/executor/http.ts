import { buildRequest, maskAuthHeaders } from "./request.js";
import type { Operation } from "../parser/types.js";
import type { AuthConfig, HttpResponse } from "./types.js";

export async function executeRequest(
  op: Operation,
  params: Record<string, unknown>,
  auth: AuthConfig,
  baseUrl: string,
  verbose = false
): Promise<HttpResponse> {
  const { method, url, headers, body } = buildRequest(op, params, auth, baseUrl);

  if (verbose) {
    console.error(`→ ${method} ${url}`);
    for (const [k, v] of Object.entries(maskAuthHeaders(headers, auth))) {
      console.error(`  ${k}: ${v}`);
    }
    if (body) console.error(`  Body: ${JSON.stringify(body)}`);
  }

  const res = await fetch(url, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const responseHeaders: Record<string, string> = {};
  res.headers.forEach((v, k) => {
    responseHeaders[k] = v;
  });

  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  if (verbose) {
    console.error(`← ${res.status} ${res.statusText}`);
  }

  return { status: res.status, headers: responseHeaders, data };
}
