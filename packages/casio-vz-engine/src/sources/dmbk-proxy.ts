// A server route that lets browser code use the dmbk library without holding the API key:
//   export const POST = createDmbkProxyHandler({ apiKey: process.env.DMBK_GRAPHQL_API_KEY! }); // Next.js route
// It takes { op, variables } from same-origin POSTs, accepts only the dmbk source's two operations with
// variables in range, and forwards the matching fixed query with the key. It never forwards query text: that
// would let any same-origin request run any operation the key allows. A standard Request → Response handler,
// so it fits any runtime with fetch (Next.js, Hono, Deno, Bun, workers).

import { checkVariables, DmbkError, isOperation, OPERATIONS } from "./dmbk-operations.ts";

export interface DmbkProxyOptions {
  apiKey: string;
  endpoint?: string | URL; // the dmbk API; defaults to https://graphql.dmbk.network/graphql
  fetch?: typeof fetch;
}

const API_URL = "https://graphql.dmbk.network/graphql";

const refuse = (status: number, code: string, message: string): Response =>
  Response.json({ data: null, errors: [{ message, extensions: { code } }] }, { status, headers: { "cache-control": "no-store" } });

// Browsers send Sec-Fetch-Site on every fetch; Origin against Host is the fallback. A request with neither is
// refused, so the check can't be skipped by leaving headers out.
function isSameOrigin(req: Request): boolean {
  const site = req.headers.get("sec-fetch-site");
  if (site) return site === "same-origin";
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin || !host) return false;
  try { return new URL(origin).host === host; } catch { return false; }
}

export function createDmbkProxyHandler({ apiKey, endpoint = API_URL, fetch: fetchFn = globalThis.fetch }: DmbkProxyOptions): (req: Request) => Promise<Response> {
  if (!apiKey) throw new Error("createDmbkProxyHandler needs an apiKey (keep it in the server's environment).");
  const url = String(endpoint);
  return async (req) => {
    if (req.method !== "POST") return refuse(405, "METHOD_NOT_ALLOWED", "Use POST.");
    if (!isSameOrigin(req)) return refuse(403, "FORBIDDEN", "Cross-origin requests are not accepted.");
    let body: { op?: unknown; variables?: unknown } | null;
    try { body = await req.json() as typeof body; } catch { body = null; }
    if (!body || !isOperation(body.op)) return refuse(400, "UNKNOWN_OPERATION", "Only the list and get operations are accepted.");
    let variables: Record<string, unknown>;
    try { variables = checkVariables(body.op, body.variables); } catch (e) {
      return refuse(400, e instanceof DmbkError ? e.code : "BAD_USER_INPUT", e instanceof Error ? e.message : "Bad variables.");
    }
    let res: Response;
    try {
      res = await fetchFn(url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": apiKey },
        body: JSON.stringify({ query: OPERATIONS[body.op], variables }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      return refuse(502, "API_UNAVAILABLE", "The dmbk API could not be reached.");
    }
    let json: unknown;
    try { json = await res.json(); } catch { return refuse(502, "API_UNAVAILABLE", `The dmbk API answered ${res.status} with no JSON.`); }
    return Response.json(json, { status: res.status, headers: { "cache-control": "no-store" } });
  };
}
