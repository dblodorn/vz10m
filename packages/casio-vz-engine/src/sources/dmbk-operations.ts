// The only two operations the dmbk library source runs, as fixed query text, and the checks on their variables.
// Shared by the client (dmbk.ts) and the proxy handler (dmbk-proxy.ts), so a proxy forwards exactly what the
// client sends and nothing else.

export const SEARCH_MAX = 12; // the API's limit on `search` (dmbkSoundVzVoices)
export const PAGE_MAX = 20;

export const OPERATIONS = {
  list: `query CasioVzEngineVoices($first: Int!, $after: String, $search: String) {
  dmbkSoundVzVoices(first: $first, after: $after, search: $search) {
    edges { node { id name } }
    pageInfo { hasNextPage endCursor }
  }
}`,
  get: `query CasioVzEngineVoice($id: ID!) {
  node(id: $id) { ... on VzVoice { id name data } }
}`,
} as const;
export type Operation = keyof typeof OPERATIONS;

export const isOperation = (op: unknown): op is Operation => op === "list" || op === "get";

export class DmbkError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "DmbkError";
    this.code = code;
  }
}

// The variables for an operation, checked. Throws DmbkError("BAD_USER_INPUT") on anything else.
export function checkVariables(op: Operation, v: unknown): Record<string, unknown> {
  const vars = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const bad = (message: string): never => { throw new DmbkError("BAD_USER_INPUT", message); };
  if (op === "get") {
    if (typeof vars.id !== "string" || !vars.id) bad("A voice id is needed.");
    return { id: vars.id };
  }
  const first = vars.first ?? PAGE_MAX;
  if (typeof first !== "number" || !Number.isInteger(first) || first < 1 || first > PAGE_MAX) bad(`first must be a whole number from 1 to ${PAGE_MAX}.`);
  if (vars.after != null && typeof vars.after !== "string") bad("after must be a cursor string.");
  if (vars.search != null && (typeof vars.search !== "string" || vars.search.length > SEARCH_MAX)) bad(`search must be at most ${SEARCH_MAX} characters.`);
  return { first, after: vars.after ?? null, search: vars.search || null };
}
