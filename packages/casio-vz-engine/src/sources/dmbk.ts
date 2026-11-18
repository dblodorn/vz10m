// The dmbk voice library (the public list of shared VZ voices on dmbk-graphql-api) as a PatchSource.
//
// Two ways to reach it:
//   direct:  { endpoint: the API, apiKey }   POSTs the query with the key in `x-api-key`. Server-side only: a key
//                                            in browser code is a key anyone can copy.
//   proxy:   { endpoint: your route }        POSTs { op, variables } to a route the host runs, which adds the key
//                                            (createDmbkProxyHandler). This is the way from a browser.
// There is no default endpoint and no key in this package: a key is issued on request.

import { VOICE_BYTES } from "../sysex.ts";
import { checkVariables, DmbkError, OPERATIONS, type Operation } from "./dmbk-operations.ts";
import type { PatchPage, PatchSource } from "./patch-source.ts";

export interface DmbkLibraryOptions {
  endpoint: string | URL;
  apiKey?: string;
  fetch?: typeof fetch;
}

interface GraphQLBody { data?: unknown; errors?: { message: string; extensions?: { code?: string } }[] }

function decodeVoice(data: unknown): Uint8Array {
  let bytes: Uint8Array;
  try { bytes = Uint8Array.from(atob(String(data)), c => c.charCodeAt(0)); } catch { throw new DmbkError("BAD_VOICE", "The voice data is not base64."); }
  if (bytes.length !== VOICE_BYTES) throw new DmbkError("BAD_VOICE", `Expected ${VOICE_BYTES} voice bytes, got ${bytes.length}.`);
  return bytes;
}

export function dmbkLibrary({ endpoint, apiKey, fetch: fetchFn = globalThis.fetch }: DmbkLibraryOptions): PatchSource {
  if (!endpoint) throw new Error("dmbkLibrary needs an endpoint: the dmbk API with an apiKey, or the URL of your proxy route.");
  const url = String(endpoint);

  async function run(op: Operation, variables: Record<string, unknown>): Promise<unknown> {
    const vars = checkVariables(op, variables); // throws before any request
    const body = apiKey ? { query: OPERATIONS[op], variables: vars } : { op, variables: vars };
    let res: Response;
    try {
      res = await fetchFn(url, {
        method: "POST",
        headers: { "content-type": "application/json", ...(apiKey ? { "x-api-key": apiKey } : {}) },
        body: JSON.stringify(body),
      });
    } catch {
      throw new DmbkError("API_UNAVAILABLE", "The dmbk API could not be reached.");
    }
    let json: GraphQLBody;
    try { json = await res.json() as GraphQLBody; } catch { throw new DmbkError("API_UNAVAILABLE", `The dmbk API answered ${res.status} with no JSON.`); }
    const first = json.errors?.[0];
    if (first) throw new DmbkError(first.extensions?.code ?? "INTERNAL_SERVER_ERROR", first.message);
    if (!res.ok) throw new DmbkError("API_UNAVAILABLE", `The dmbk API answered ${res.status}.`);
    return json.data;
  }

  return {
    async list(query = {}): Promise<PatchPage> {
      const data = await run("list", { ...query }) as { dmbkSoundVzVoices: { edges: { node: { id: string; name: string } }[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } };
      const conn = data.dmbkSoundVzVoices;
      return {
        items: conn.edges.map(({ node }) => ({ id: node.id, name: node.name })),
        next: conn.pageInfo.hasNextPage ? conn.pageInfo.endCursor : null,
      };
    },
    async get(id) {
      const data = await run("get", { id }) as { node: { data?: string } | null };
      if (!data.node || data.node.data === undefined) throw new DmbkError("NOT_FOUND", `No voice ${id}.`);
      return decodeVoice(data.node.data);
    },
  };
}
