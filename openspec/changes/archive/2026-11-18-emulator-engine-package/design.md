# Design

## Context

See `proposal.md` for why, and `specs/casio-vz-engine-sdk` and `specs/engine-packages` for the requirements.

How things stand:
- The engine (`lib/vz/engine/`: `engine.ts`, `patch.ts`, `waves.ts`, `convert.ts`) depends on the codec only through `get()` in `patch.ts`, and that reads through the field tables in `lib/vz/params.ts`.
- The worklet (`worklet/vz-processor.ts`) is about 30 lines. It is bundled by esbuild into `public/vz-worklet.js` and loaded by URL from `lib/audio.ts`.
- `lib/audio.ts` mixes two jobs: the editor's own (one global context created in a click, output-device choice, suspend on SOUND off) and the worklet plumbing (`addModule`, the node, posting messages). Only the plumbing is generic.
- Tests and scripts run as `.ts` straight from Node (v26 here), relying on `erasableSyntaxOnly` and explicit `.ts` imports.
- Sharing goes through Relay and `app/api/graphql/route.ts`, which forwards only persisted operation ids. Keyless reads work at the API today.
- One voice can be fetched with `node(id: ID!)` → `... on VzVoice { name data }`, where `data` is 336 bytes as base64.

## Goals / Non-Goals

**Goals:**
- The engine source exists in one place, and the editor plays it straight from the workspace with no build step for TypeScript during development.
- A host outside the repo installs the package and plays a voice with no bundler setup.
- Running a second engine repo (DX7) means copying the layout and the package skeleton, not inventing them.

**Non-Goals:**
- A shared `engine-core` package, or a common abstract base. The convention lives in the spec and in each package's README until a second engine shows what really is common.
- Moving the editor's SHARED tab off Relay onto the package's dmbk source.
- MIDI input handling inside the package. Hosts call `noteOn`/`noteOff` themselves.
- Stereo or effects. The engine stays mono, copied to every output channel, as it does now.
- Changing anything in dmbk-graphql-api.

## Decisions

### 1. Workspace layout, moved with `git mv`

```
/                     private root package.json (scripts fan out), pnpm-workspace.yaml, tsconfig.base.json,
                      openspec/, CLAUDE.md, AGENTS.md, .github/workflows/
apps/editor/          the Next.js app as it is now (app/, components/, lib/, scripts/, test/, public/, schemas/…)
packages/casio-vz-engine/
  src/                index.ts, voice.ts (params, read-only codec, SysEx parsing), engine/, worklet/, synth.ts,
                      offline.ts, sources/ (patch-source.ts, dmbk.ts, dmbk-proxy.ts)
  test/               engine, oscillators, modulation and the read-side codec tests
  CHANGELOG.md, README.md
```

The files move with `git mv` so `git log --follow` keeps their history. The root `package.json` has `dev`, `build`, `test` and `typecheck` that run `pnpm -r` (or `--filter`) so the commands in `CLAUDE.md` keep working from the root.

*Alternative:* the package stays at the repo root and the app moves under it. That makes the layout differ between instrument repos, which is exactly what the convention is meant to prevent.

### 2. Split at "reads" vs "writes"

What the package exports:
- the field tables (`VOICE_FIELDS`, `voiceField`, …), so there is still one table;
- `get`, `getName`, `toParams`;
- SysEx reading: `parse`, `splitMessages`, `isVz`, `checksum`, `denibblize`, the constants;
- `fromSyx`, and a new `readVoice(bytes)` that takes 336 bytes or one voice message.

What the editor keeps, in `apps/editor/lib/vz/codec.ts` and `sysex.ts`, which import the read side from the package: `set`, `setMany`, `setName`, `frame`, `nibblize`, `toSysex`, `toSyx`, `initVoice`, `initOperation`.

`checksum` is exported because it only computes a value, and both sides need it. This keeps the spec's "no export writes a voice or produces SysEx".

*Alternative:* export everything, with editing behind a subpath (`/edit`). It's simpler to move, but it breaks the playback-only contract in the spec, and other packages would copy that.

### 3. Workspace consumption from source, published from `dist`

In the package's `package.json`, `exports["."]` points at `./src/index.ts`. `publishConfig.exports` points at `./dist/index.js` and `./dist/index.d.ts`, and pnpm swaps it in at publish.

How each consumer sees it:
- The editor adds `transpilePackages: ["@dblodorn/casio-vz-engine"]` to `next.config.ts`, so Next compiles the source.
- Node tests and `scripts/render.ts` import the `.ts` directly. The workspace link resolves to its real path under `packages/`, not `node_modules/`, so Node's type stripping applies.
- `dist/` is built only for publishing: `tsc` with `rewriteRelativeImportExtensions` and `declaration` turns the `.ts` imports into `.js` imports, and esbuild builds the worklet.

*Alternative:* the editor depends on the built `dist/` and runs a watcher. That adds a build step to every engine edit and a second process to `dev`. It also means the editor tests what is actually published, which this design gets instead from a CI smoke test (see Risks).

### 4. Worklet delivery: an inlined module loaded from a Blob URL by default, with `workletUrl` as an override

The package build bundles `src/worklet/processor.ts` (engine included) with esbuild in two forms:
- `dist/worklet.js`, a file hosts can serve;
- `src/worklet/code.generated.ts`, which exports the same code as a string. It is git-ignored, generated by the package's `build:worklet`, and copied into `dist`.

`createSynth` calls `addModule` on a Blob URL made from that string. That needs no bundler support and no files in `public/`, which is what the Next.js scenario in `engine-packages` requires. A host whose CSP refuses `blob:` passes `{ workletUrl }` and serves `dist/worklet.js` itself.

`addModule` runs once per context: the promise is cached in a `WeakMap<BaseAudioContext, Promise<void>>`, so several synths share it. The processor name includes the package name (`casio-vz-engine`) so engines from different packages can share a context.

In the workspace, the editor's `dev`/`build` run the package's `build:worklet` first, which replaces today's `pnpm worklet`, and `public/vz-worklet.js` goes away. As now, changes to the engine show up in the worklet after a restart. Only the main-thread code gets hot reload.

*Alternatives:*
- `new URL("./worklet.js", import.meta.url)`: webpack and Turbopack handle it differently, and some bundlers rewrite it badly inside `node_modules`.
- Asking hosts to copy a file into `public/`: breaks "no copied files".

### 5. Public API

```ts
createSynth(ctx: BaseAudioContext, opts?: { workletUrl?: string | URL }): Promise<Synth>
interface Synth {
  readonly output: AudioNode;          // connect it anywhere
  loadVoice(voice: Uint8Array): void;  // 336 bytes or one voice SysEx message; throws, keeps the old voice
  noteOn(note: number, velocity?: number): void;   // velocity 0 => noteOff; out of range throws
  noteOff(note: number): void;
  allNotesOff(): void;
  dispose(): void;                     // all off, disconnect, close the port
}
createOfflineSynth(sampleRate: number): OfflineSynth   // same methods minus output/dispose, plus render(out, frames, offset?)
readVoice(bytes): Uint8Array;  fromSyx(bytes): { items, errors };  getName, get, toParams, field tables
interface PatchSource { list(q?: { search?: string; after?: string; first?: number }): Promise<{ items: { id: string; name: string }[]; next: string | null }>; get(id: string): Promise<Uint8Array> }
dmbkLibrary(opts: { endpoint: string; apiKey?: string; fetch?: typeof fetch }): PatchSource
createDmbkProxyHandler(opts: { apiKey: string; endpoint?: string }): (req: Request) => Promise<Response>
```

- **Validation lives in one place.** `Synth` and `OfflineSynth` share one validation function, so the browser and Node give the same errors. `loadVoice` validates (length, or a full `parse`) on the main thread before posting, so a bad voice never reaches the audio thread.
- **Notes.** The engine's `noteOn` already clamps velocity. The velocity-0-as-note-off rule is added in the wrapper, not the engine, so `render()` doesn't change.
- **The editor.** `lib/audio.ts` keeps its context, device and suspend logic, and replaces its worklet plumbing with `createSynth(ctx)` and `synth.output.connect(ctx.destination)`. KEYS already sends velocities from 1 to 127, so nothing changes there.

### 6. The dmbk source talks GraphQL with fixed query text, and its proxy accepts operation names, not queries

The two documents live in the package as constants:
- `dmbkSoundVzVoices(first, after, search)` → `edges { node { id name } } pageInfo`;
- `node(id)` → `... on VzVoice { name data }`.

How it works in each mode:
- **Direct mode** (`endpoint` = the API, `apiKey` given): it POSTs `{ query, variables }` with `x-api-key`.
- **Proxy mode** (no key): it POSTs `{ op: "list" | "get", variables }` to the host's URL.

`createDmbkProxyHandler` is a standard `Request → Response` handler a host mounts as a route, for example `export const POST = createDmbkProxyHandler({ apiKey: process.env.DMBK_GRAPHQL_API_KEY! })` in Next. It:
- accepts only same-origin POSTs, checking `Sec-Fetch-Site`, or else `Origin` against `Host`, the same rule as the editor's route;
- accepts only those two op names, and checks the variables (`first` 1–20, `search` ≤ 12);
- forwards the matching query with the key.

The proxy never runs arbitrary query text, for the same reason the editor's route forwards only persisted ids.

Errors: the source checks the search length and the 336-byte `data` before and after the request. GraphQL errors are thrown as `DmbkError` with the API's `extensions.code`, as `ApiError` does in the editor.

*Alternative:* Relay persisted ids in the package. That ties every host to Relay and to this repo's compiled id map. Rejected.

### 7. Publishing: a tag-triggered workflow with GitHub's token

`.github/workflows/publish-casio-vz-engine.yml` runs on tags matching `casio-vz-engine@*`, with `permissions: { contents: read, packages: write }`. The steps:
1. pnpm install;
2. check the tag's version against the package's `version`, and fail on a mismatch;
3. typecheck, test, and build;
4. a packed smoke test (decision 3);
5. `pnpm publish --filter @dblodorn/casio-vz-engine --no-git-checks` with `NODE_AUTH_TOKEN=${{ secrets.GITHUB_TOKEN }}`.

The package's `publishConfig.registry` is `https://npm.pkg.github.com`, and its `repository` field points at `dblodorn/vz10m`, which links the package to the repo.

Versions are bumped by hand with a `CHANGELOG.md` entry. There are no changesets while there is one package.

The editor depends on it as `workspace:*`.

## Risks / Trade-offs

- **[GitHub Packages needs a token to install, even for public packages]** → The README documents the `.npmrc` (`@dblodorn:registry=https://npm.pkg.github.com` plus a classic token with `read:packages`). This is friction for "anyone else". If it matters later, the same tag workflow can also publish to npmjs under a matching scope, with no change to the package.
- **[Keyless reads at the API]** → The SDK requires an endpoint and treats a key as the documented path, but anyone can still call the API without one. Enforcement belongs to dmbk-graphql-api (proposal, Impact).
- **[The workspace tests source, consumers get `dist`]** → CI packs the package (`pnpm pack`), installs the tarball into a scratch project and renders a note through `createOfflineSynth`, so a broken `exports`, a missing `.js` extension or a missing worklet string fails before publishing.
- **[Blob-URL worklets and strict CSP]** → `workletUrl` overrides it, and the README says when to use it.
- **[`transpilePackages` with `.ts` imports]** → Next compiles workspace TS that uses `.ts` extensions when `allowImportingTsExtensions` is set in the package's tsconfig. If the dev server objects, the fallback is to point the editor at a `dist` built by a watcher (decision 3's alternative). Check this first during implementation.
- **[Vercel build after the move]** → The project's root directory must be set to `apps/editor` before the first deploy from the new layout, or the deploy fails. Vercel installs from the workspace root automatically.
- **[Two `tsconfig`s drifting]** → Both extend `tsconfig.base.json`, which holds the strict options (`noUncheckedIndexedAccess`, `erasableSyntaxOnly`, `verbatimModuleSyntax`, `allowImportingTsExtensions`).

## Migration Plan

1. Create the workspace (`pnpm-workspace.yaml` with `apps/*` and `packages/*`, root `package.json`, `tsconfig.base.json`), and `git mv` the app into `apps/editor`. Check that `pnpm dev`, `test`, `typecheck` and `build` pass with no other change.
2. Create `packages/casio-vz-engine` and `git mv` the engine, the worklet and the read side of the codec into it. Split `test/vz.test.ts` into read and write halves, and point the editor's imports at the package.
3. Add `createSynth`/`createOfflineSynth`, and move `lib/audio.ts` and `scripts/render.ts` onto them.
4. Add the patch sources and the proxy handler, with tests against a stubbed `fetch`. No test calls the real API.
5. Add the build, the CI publish workflow and the smoke test, and update `CLAUDE.md`/`AGENTS.md`.
6. Change the Vercel project's root directory to `apps/editor`, deploy a preview, check SOUND, KEYS, SHARED and BANKS, and promote.
7. Tag `casio-vz-engine@0.1.0`.

**Rollback:** revert the merge commit and set the Vercel root directory back to `/`. Published versions stay on GitHub Packages and don't affect the editor.

## Open Questions

- Whether also publishing to npmjs is worth it for other developers. It can be added to the workflow later without changing the package.
