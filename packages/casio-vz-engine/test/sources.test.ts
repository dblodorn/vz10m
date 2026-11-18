import { test } from "node:test";
import assert from "node:assert/strict";
import { createDmbkProxyHandler, createOfflineSynth, dmbkLibrary, DmbkError, type PatchSource } from "../src/index.ts";
import { initVoice, set } from "./voices.ts";

const KEY = "test-key-0123456789";
const b64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));

interface Call { url: string; headers: Record<string, string>; body: Record<string, unknown> }
// A fetch that records requests and answers with `reply(body)`.
function stubFetch(reply: (body: Record<string, unknown>) => unknown, status = 200) {
  const calls: Call[] = [];
  const fn = (async (input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    calls.push({ url: String(input), headers: init?.headers as Record<string, string>, body });
    return Response.json(reply(body), { status });
  }) as typeof fetch;
  return { fn, calls };
}

const LIST = {
  data: {
    dmbkSoundVzVoices: {
      edges: [{ node: { id: "VzVoice:2", name: "NEWER" } }, { node: { id: "VzVoice:1", name: "OLDER" } }],
      pageInfo: { hasNextPage: true, endCursor: "c2" },
    },
  },
};

test("bring your own library: a source over stored voices plays exactly like the bytes", async () => {
  const stored = new Map([["pad", set(initVoice("PAD"), "m1.wave", 4)]]);
  const mine: PatchSource = {
    async list() { return { items: [...stored].map(([id, v]) => ({ id, name: id.toUpperCase() })), next: null }; },
    async get(id) { const v = stored.get(id); if (!v) throw new Error("none"); return v; },
  };
  const a = createOfflineSynth(48000), b = createOfflineSynth(48000);
  a.loadVoice(await mine.get((await mine.list()).items[0]!.id));
  b.loadVoice(stored.get("pad")!);
  const x = new Float32Array(9600), y = new Float32Array(9600);
  a.noteOn(60); b.noteOn(60); a.render(x); b.render(y);
  assert.deepEqual(x, y);
});

test("with a key: the key goes in a header, never a URL; voices come back newest first", async () => {
  const { fn, calls } = stubFetch(() => LIST);
  const lib = dmbkLibrary({ endpoint: "https://api.example/graphql", apiKey: KEY, fetch: fn });
  const page = await lib.list({ search: "pad" });
  assert.deepEqual(page.items.map(i => i.name), ["NEWER", "OLDER"]);
  assert.equal(page.next, "c2");
  assert.equal(calls[0]!.headers["x-api-key"], KEY);
  assert.ok(!calls[0]!.url.includes(KEY));
  assert.match(String(calls[0]!.body.query), /dmbkSoundVzVoices/);
  assert.deepEqual(calls[0]!.body.variables, { first: 20, after: null, search: "pad" });
});

test("get: base64 data becomes the voice's 336 bytes", async () => {
  const v = initVoice("GOT");
  const { fn, calls } = stubFetch(() => ({ data: { node: { id: "VzVoice:1", name: "GOT", data: b64(v) } } }));
  const got = await dmbkLibrary({ endpoint: "https://api.example/graphql", apiKey: KEY, fetch: fn }).get("VzVoice:1");
  assert.deepEqual(got, v);
  assert.deepEqual(calls[0]!.body.variables, { id: "VzVoice:1" });
});

test("through a proxy: { op, variables } and no key header", async () => {
  const { fn, calls } = stubFetch(() => LIST);
  await dmbkLibrary({ endpoint: "/api/vz-voices", fetch: fn }).list({ first: 5 });
  assert.equal(calls[0]!.url, "/api/vz-voices");
  assert.equal(calls[0]!.headers["x-api-key"], undefined);
  assert.equal(calls[0]!.body.op, "list");
  assert.equal(calls[0]!.body.query, undefined);
});

test("a search over 12 characters is refused with no request", async () => {
  const { fn, calls } = stubFetch(() => LIST);
  await assert.rejects(dmbkLibrary({ endpoint: "/p", fetch: fn }).list({ search: "THIRTEEN CHAR" }), DmbkError);
  assert.equal(calls.length, 0);
});

test("voice data that isn't 336 bytes is refused", async () => {
  const { fn } = stubFetch(() => ({ data: { node: { id: "x", name: "X", data: b64(new Uint8Array(100)) } } }));
  await assert.rejects(dmbkLibrary({ endpoint: "/p", fetch: fn }).get("x"), (e: unknown) => e instanceof DmbkError && e.code === "BAD_VOICE");
});

test("an API error reaches the host with its code", async () => {
  const { fn } = stubFetch(() => ({ data: null, errors: [{ message: "Slow down.", extensions: { code: "RATE_LIMITED" } }] }), 429);
  await assert.rejects(dmbkLibrary({ endpoint: "/p", fetch: fn }).list(), (e: unknown) => e instanceof DmbkError && e.code === "RATE_LIMITED");
});

test("no endpoint: creation fails naming the endpoint", () => {
  assert.throws(() => dmbkLibrary({ endpoint: "" }), /endpoint/);
});

// ---- the proxy handler ----

const post = (body: unknown, headers: Record<string, string> = { "sec-fetch-site": "same-origin" }) =>
  new Request("https://app.example/api/vz-voices", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

test("proxy: forwards a valid list with the key and the fixed query", async () => {
  const { fn, calls } = stubFetch(() => LIST);
  const handler = createDmbkProxyHandler({ apiKey: KEY, endpoint: "https://api.example/graphql", fetch: fn });
  const res = await handler(post({ op: "list", variables: { first: 10, search: "pad" } }));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), LIST);
  assert.equal(calls[0]!.headers["x-api-key"], KEY);
  assert.match(String(calls[0]!.body.query), /dmbkSoundVzVoices/);
});

test("proxy: refuses cross-site, unknown ops, first 21 and query text", async () => {
  const { fn, calls } = stubFetch(() => LIST);
  const handler = createDmbkProxyHandler({ apiKey: KEY, endpoint: "https://api.example/graphql", fetch: fn });
  const cases: [Request, number][] = [
    [post({ op: "list" }, { "sec-fetch-site": "cross-site" }), 403],
    [post({ op: "list" }, {}), 403], // no Sec-Fetch-Site and no Origin
    [post({ op: "delete", variables: { id: "1" } }), 400],
    [post({ op: "list", variables: { first: 21 } }), 400],
    [post({ query: "mutation { dmbkSoundDeleteVzVoice(input: {}) { deletedVzVoiceId } }" }), 400],
    [new Request("https://app.example/api/vz-voices"), 405],
  ];
  for (const [req, status] of cases) assert.equal((await handler(req)).status, status);
  assert.equal(calls.length, 0);
});

test("proxy: Origin matching Host is same-origin", async () => {
  const { fn, calls } = stubFetch(() => LIST);
  const handler = createDmbkProxyHandler({ apiKey: KEY, fetch: fn });
  assert.equal((await handler(post({ op: "list" }, { origin: "https://app.example", host: "app.example" }))).status, 200);
  assert.equal(calls[0]!.url, "https://graphql.dmbk.network/graphql");
});

test("proxy and client together: the browser side never sees the key", async () => {
  const upstream = stubFetch(() => LIST);
  const handler = createDmbkProxyHandler({ apiKey: KEY, fetch: upstream.fn });
  const browserFetch = (async (input: string | URL | Request, init?: RequestInit) =>
    handler(new Request(new URL(String(input), "https://app.example"), { ...init, headers: { ...(init?.headers as Record<string, string>), "sec-fetch-site": "same-origin" } }))) as typeof fetch;
  const page = await dmbkLibrary({ endpoint: "/api/vz-voices", fetch: browserFetch }).list();
  assert.equal(page.items.length, 2);
  assert.equal(upstream.calls[0]!.headers["x-api-key"], KEY);
});

test("the proxy needs a key", () => {
  assert.throws(() => createDmbkProxyHandler({ apiKey: "" }), /apiKey/);
});
