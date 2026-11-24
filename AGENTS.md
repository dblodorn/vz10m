# VZ-10M editor and engine

A browser editor and librarian for the Casio VZ-10M (also reads VZ-1 dumps), over Web MIDI SysEx, and its emulator published as a package (`@dblodorn/casio-vz-engine`) that other apps (windchime next) use as a sound source. Sibling of `~/Desktop/sound/windchime`. Same stack, same UI rules.

A pnpm workspace:
- `apps/editor`: the Next.js app (package `vz10m-editor`).
- `packages/casio-vz-engine`: the engine package.
- `openspec/`, these docs and `.github/workflows/` stay at the root.

## Commands

Run from the root. They fan out to the workspace (`pnpm -F <name> <script>` for one package).

- `pnpm dev`, `pnpm build`: the editor. Both build the engine's worklet first (`pnpm -F vz10m-editor engine`), then `banks` and `relay`.
- `pnpm test`: every package's `test/*.test.ts` through `node --test`, which runs the `.ts` files directly.
  - The engine package holds the engine, oscillators, lines, modulation, codec (read side), offline, worklet and sources tests.
  - The editor holds the codec (write side), play, sharing and banks tests.
  - Any `.syx` in `apps/editor/fixtures/` must round-trip byte for byte (none are checked in yet; that's issue #1).
  - One file: `node --expose-gc --test packages/casio-vz-engine/test/engine.test.ts`; one test: add `--test-name-pattern "<name>"`. The engine's tests import `src/worklet/code.generated.ts`, so run `pnpm -F @dblodorn/casio-vz-engine build:worklet` once first.
  - Keep `--expose-gc`: without it the "allocates nothing" tests for `render()` are skipped, not failed.
- `pnpm typecheck`: `tsc --noEmit` in each package. Must be clean; `pnpm build` type-checks too.
- `pnpm relay`: the Relay compiler; writes `__generated__/` and `apps/editor/lib/server/persisted-operations.json` (both git-ignored). `dev` and `build` run it.
- SHARED needs `DMBK_GRAPHQL_API_KEY` in `apps/editor/.env.local` (the project is linked to Vercel). Without it the route throws in production and forwards without `x-api-key` in dev; nothing else needs it.
- Installing needs a token: the sound design system's packages (`@dblodorn/sound-ui`, `@dblodorn/sound-tokens`) come from GitHub Packages. `.npmrc` holds only `@dblodorn:registry=https://npm.pkg.github.com`; the token comes from `~/.npmrc` locally and from the `NPM_RC` env var (Production and Preview, Sensitive) on Vercel, as in windchime and dx7.
- `pnpm schema:pull`: refresh `apps/editor/schemas/dmbk-graphql-api.graphql` from the API, then commit it.
- `pnpm banks`: bundles `worker/banks-worker.ts` into `apps/editor/public/vz-banks.js` and copies `sqlite3.wasm` beside it (both git-ignored). `dev` and `build` run it.
- Engine package (`pnpm -F @dblodorn/casio-vz-engine …`):
  - `build:worklet` writes `dist/worklet.js` and `src/worklet/code.generated.ts` (both git-ignored);
  - `build` writes `dist/` for publishing;
  - `smoke` packs the package, installs the tarball outside the workspace, type-checks a consumer and renders a note.
- Don't run `pnpm build` while `pnpm dev` is running: it overwrites `.next` and the dev server starts returning 500s. Restart dev with `rm -rf apps/editor/.next` if that happens.

## The engine package (`packages/casio-vz-engine`)

Playback only. It can read a voice (`get`, `getName`, `toParams`, the field tables, SysEx parsing, `fromSyx`, `readVoice`) and play it (`createSynth`, `createOfflineSynth`), and it has patch sources (`PatchSource`, `dmbkLibrary`, `createDmbkProxyHandler`). The public API is documented in its `README.md`.

- **Nothing in it writes.** No export changes a voice or builds SysEx, and `test/codec.test.ts` enforces it. Writing (`set`, `setMany`, `setName`, `frame`, `nibblize`, `toSysex`, `toSyx`, `initVoice`) lives in `apps/editor/lib/vz/codec.ts` and `sysex.ts`. Those files re-export the read side, so the editor imports one codec. The package's tests build voices with `test/voices.ts`, a test-only copy of `set`/`initVoice`.
- **One field table.** `src/params.ts` is the only copy. The editor imports it from the package.
- **The editor uses the source.** In the workspace, `exports["."]` points at `src/index.ts`, and `next.config.ts` lists the package in `transpilePackages`. `publishConfig.exports` swaps in `dist/` when publishing. Node tests and `scripts/render.ts` import the `.ts` files directly.
- `src/engine/`: the emulator, which runs in Node and in the AudioWorklet.
  - `convert.ts` is the calibration file: every stored value → rate / gain / Hz curve, all ESTIMATES. A change here changes the sound: release it as at least a minor version, with a changelog line.
  - `patch.ts`: voice bytes → `Patch`, converted once per voice change.
  - `engine.ts`: 16 voices × 8 modules. `render()` adds into its buffer and must never allocate.
  - `waves.ts`: the eight DCO waveforms, allocation-free, shapes from `convert.ts`.
- `src/worklet/processor.ts`: the AudioWorkletProcessor, registered as `casio-vz-engine`. `src/worklet/messages.ts` types the messages to it. `build:worklet` bundles it.
- `src/synth.ts`: `createSynth(ctx)`.
  - It adds the worklet once per context, from a Blob URL of the bundled code by default, or from `workletUrl`.
  - It checks every input on the main thread, so a bad voice or note never reaches the audio thread.
  - It never creates, resumes or closes the host's context.
- `src/offline.ts`: `createOfflineSynth(sampleRate)`, the same engine and the same checks (`src/notes.ts`) without Web Audio.
- `src/sources/`: the dmbk library client and its proxy handler share the two fixed queries and the checks on their variables (`dmbk-operations.ts`). The proxy forwards only those two operations, never query text. The package holds no key and the client has no default endpoint: a key is issued on request.
- Publishing: push a tag `casio-vz-engine@<version>` and `.github/workflows/publish-casio-vz-engine.yml` publishes to GitHub Packages. It refuses if the tag doesn't match `package.json`, and runs typecheck, test, build and smoke first. Bump the version by hand and add a `CHANGELOG.md` entry.

## Engine package convention (`[manufacturer]-[model]-engine`)

Every emulator gets the same shape, so a future DX7 repo copies this one (`openspec/specs/engine-packages`):

- **Name and place:**
  - the package is `@dblodorn/<manufacturer>-<model>-engine` (scope = the GitHub owner, as GitHub Packages requires), at `packages/<manufacturer>-<model>-engine`;
  - the editor is at `apps/editor` in the instrument's own repo.
- **Common surface, in the instrument's own patch format:**
  - `createSynth(ctx, { workletUrl? })` with `output`, `loadVoice`, `noteOn`/`noteOff`/`allNotesOff` (MIDI ranges, velocity 0 = note-off) and `dispose`;
  - `createOfflineSynth(sampleRate)`;
  - reading patches from bytes and from the instrument's dump format;
  - the `PatchSource` shape.
  - No editing.
- **Ready to use:**
  - ES modules plus `.d.ts` files with `.js` paths (`scripts/rewrite-dts.ts`);
  - the worklet both inlined (`code.generated.ts`) and as a file (`./worklet.js`);
  - nothing touches browser globals at import.
- **Publishing:** one workflow per package, triggered by its own tag prefix; semver, where a sound change is at least minor.
- **Shared code:** no shared base package until a second engine shows what is really common.

## Editor layout (`apps/editor`)

- `lib/vz/codec.ts`, `lib/vz/sysex.ts`: the write side (above), re-exporting the package's read side.
- `lib/midi.ts`: Web MIDI in and out with SysEx, ported from windchime's `lib/midiout.js`.
- `lib/store.ts`: localStorage under `vz10m.*`, plus the library.
- `lib/audio.ts`: the editor's audio.
  - It starts audio inside a click and owns the `AudioContext`.
  - It applies the output device (`setSinkId`, typed in `types/audio-sink.d.ts`).
  - It suspends on SOUND off, and plays through the package's `createSynth`.
- `worker/banks-messages.ts` types the page ↔ banks worker messages (one answer per request id). Change the message type there, then both sides.
- `lib/play.ts`: the note router. PLAY TO goes to the emulator, the VZ or both, held keys are counted per source, and it is tested in Node.
- `lib/router.ts`: the app's instance of it. Every note played from the page goes through it.
- The interface comes from `@dblodorn/sound-ui` and `@dblodorn/sound-tokens` (the sound design system, https://soundsystem.dmbk.io; pinned exactly). `app/globals.css` imports `@dblodorn/sound-ui/styles.css` and `@dblodorn/sound-tokens/fonts.css` (Knif Mono comes from there, not from this repo) and keeps only the page padding and `.lead`. `params.tsx` and `Info.tsx` wrap the package's rows and (?) so `info` takes a `lib/help.ts` key (and `FieldRow` shows the engine's numeric `display` as text).
- Adapters from voice bytes to the package's drawings: `components/EnvelopeEditor.tsx` (EnvelopeEditor, "step" layout: eight steps, sustain, velocity rate and END STEP as its extra rows; drawn 120 high through `--sound-envelope-*` overrides) and `KeyFollow` in `Editor.tsx` (BreakpointCurve: six key/value points, note names, the DCA level's 99–0 reading).
- `components/KeyboardFloater.tsx`: the draggable KEYS panel (the package's KeyboardFloater with OCTAVE, VELOCITY, PLAY TO). It's loaded with `next/dynamic`, and its settings are stored under `vz10m.keys.*`.
- `lib/help.ts` + `components/Info.tsx`: the (?) popovers. Entries are written in our own words from the manual, citing pages (don't paste manual text), with an "in this editor" note where the emulator estimates. Add `info="key"` to a `Param` / `Check` / `FieldRow` to place one.
- `scripts/render.ts`: `node apps/editor/scripts/render.ts voice.syx 60 1 out.wav` renders a note offline (through `createOfflineSynth`).
- `components/Library.tsx`: the LIBRARY sheet, tabs LOCAL / SHARED / BANKS / COLOPHON (the tab and the chosen bank are stored as `vz10m.library.tab` and `vz10m.banks.active`). SHARED and BANKS are their own `next/dynamic` chunks.
- `components/Shared.tsx`: the public list through Relay (`dmbkSoundVzVoices` and the save/update/delete mutations of dmbk-graphql-api's `vz-voices`).
  - `app/api/graphql/route.ts` is the editor's only way to the API: same-origin POSTs of persisted ids, forwarded with `DMBK_GRAPHQL_API_KEY` and `x-end-user-ip` (copied from windchime; see its CLAUDE.md).
  - `lib/relay/environment.ts` raises the API's code as `ApiError`.
  - The package's `dmbkLibrary` is for other apps; the editor keeps Relay.
- `lib/device.ts`: the device key (32 random bytes, base64url, `vz10m.deviceKey`) that makes shared voices "yours". Made on the first share. The API stores only its hash. Never put it in a URL.
- `lib/vz/names.ts`: a copy of the API's obscene-name check (`obscenity` + spelled-out letters), so SHARE and RENAME refuse at once. Keep it in step with dmbk-graphql-api's `src/lib/vz/names.ts`.
- `lib/banks/db.ts`: every bank query, on any SQLite `Database`.
  - Schema v1 by `PRAGMA user_version`. Add migration steps; never edit v1.
  - `worker/banks-worker.ts` opens it on OPFS's SAH-pool VFS (no COOP/COEP needed). One tab at a time; others fall back to memory with a warning.
  - `lib/banks/client.ts` is the page's promise wrapper.
- `lib/files.ts`: `download` and `.syx` file names.
- `components/Editor.tsx` is the one client root. `components/Library.tsx` loads through `next/dynamic`. `components/params.tsx` holds the row vocabulary (`Param`, `ParamSlider`, `ParamSelect`, `Check`, `FieldRow`).

## Constraints and decisions to keep

- **TypeScript, strict.** All code is TS (the user wants every project in TS), even where it's copied from JS repos like windchime.
  - Both packages extend `tsconfig.base.json`, which holds the strict options.
  - `noUncheckedIndexedAccess` is on.
  - `erasableSyntaxOnly`, so Node can run the code and the tests without a build step. That means no enums and no parameter properties.
  - Imports inside `lib/` and the package use explicit `.ts` extensions (`allowImportingTsExtensions`), so Node resolves them.
  - Look fields up with `voiceField(key)`, which throws on an unknown key, rather than indexing `VOICE_FIELD`.
- **Bytes are the source of truth.** A voice is its decoded `Uint8Array(336)`. Edits go through `set()` and touch only that field's bits; never rebuild a voice from params. This keeps unknown bits intact and is the shape the API will store.
- **Don't guess the format.** Every byte layout in `params.ts` comes from a cited source (`openspec/specs/vz-sysex`, and `design.md` in `openspec/changes/archive/2026-11-18-vz10m-editor-sysex`). Conflicting facts are marked `unverified: true` until a hardware dump settles them. The VZ-10M has no dump-request message (owner's manual p.89): selecting a sound on the VZ with EXCLUSIVE=ENA transmits it. Bulk SAVE/LOAD exists (MENU 3-02), but its byte format isn't documented in the manual, so it isn't implemented.
- **Raw values in the UI** until the panel-scale conversions are confirmed. Only give a field `display` where a source states the conversion.
- **SSR:** neither `lib/*` nor the package touches `window`, `document`, `navigator` or `localStorage` at module top level. Capability checks and storage reads happen in a mount effect. Listeners return unsubscribe functions (strict mode).
- **MIDI access only on a click** (CONNECT MIDI), with `sysex: true`. Chrome/Edge only in practice; Safari has no Web MIDI.
- **Typeface credit:** LIBRARY → COLOPHON credits Knif Mono first with the package's `TypeCredit` (TYPE: KNIF MONO BY A IS FOR FONTS, https://aisforfonts.com/knif/), then links SOUND DESIGN SYSTEM (https://soundsystem.dmbk.io/). It's licensed under A is for fonts' webfont EULA; keep the credit.
- **UI = the sound design system's 1-bit language** (windchime's, now in `@dblodorn/sound-ui`):
  - every token `#000`/`#fff`, no radius, no shadows, no dark mode
  - Knif Mono; uppercase labels; text instead of icons
  - `LABEL ..... value` rows with the control beneath
  - dashed 1px focus outline; inverted hover/pressed
  - a control the package lacks goes into the package (sound-design-system), not into this repo
- **Changelogs:** every shipped change to the editor adds a line at the top of `apps/editor/lib/changelog.ts`. Every package release adds an entry to the package's `CHANGELOG.md`.
- **OpenSpec:** features go through `openspec/changes/<name>/` (proposal, design, tasks, spec deltas) and are archived when done.

## Testing in a browser

Stub `navigator.requestMIDIAccess` with one fake input/output pair (an `addInitScript` in Playwright). Record `output.send` calls, and call the input's `onmidimessage` with a dump to play the VZ. Check for:
- no console errors or hydration warnings
- no horizontal scroll at 390 px

To check that the emulator sounds, wrap `AudioNode.prototype.connect` in the init script so anything connected to the destination is also connected to an `AnalyserNode`, then read its peak after a note.

When testing `createSynth` with an `OfflineAudioContext`, post messages at a `ctx.suspend(t)` point and give them a moment before `resume()`: port messages aren't delivered in step with an offline render.

For SHARED, answer `**/api/graphql` with `context.route` by operation name (look the posted id up in `apps/editor/lib/server/persisted-operations.json`), so tests never write to the production list. BANKS runs on the real worker and OPFS in headless Chromium.

## Roadmap

1. Editor + SysEx: done and archived (`openspec/specs/vz-sysex`, `voice-editor`, `midi-io`, `library`). The hardware checks (fixtures, the flagged fields, sending, bulk transfer) are in issue #1.
2. iPD emulator: archived (`openspec/specs/vz-engine`, `audio-output`; the estimates table is in the archived change's `design.md`). Steps 1–4 are done: every voice parameter is played, with semantics from the VZ-10M owner's manual (MENU 1, pp.35–50), and every curve is in `convert.ts` (sourced or ESTIMATE). Step 5 is done: the real worklet in Chrome runs the worst case at about 5% of one core (no WebAssembly needed), and AUDIO picks the output device. Calibration against the hardware is issue #1, for later. The manual PDF is at https://static.wikitide.net/circuitbendingwiki/a/ad/Casio_VZ10M_Owners_Manual.pdf (a scan; the MIDI implementation chart it refers to isn't included).
3. Sharing and banks: done, checked on production 2026-11-18, archived (`openspec/specs/shared-voices`, `openspec/specs/banks`). Voices only go to dmbk-graphql-api (`dmbk-sound.vz_voices`), anonymously, owned by a device key: no accounts, by the user's choice. Banks stay on the device in SQLite.
4. Engine package: done and archived (`openspec/specs/casio-vz-engine-sdk`, `engine-packages`). `@dblodorn/casio-vz-engine@0.1.0` (MIT) is on GitHub Packages, published by the workflow on 2026-11-18; production builds from `apps/editor` (Vercel root directory). Windchime adopts the package in its own change.
