# VZ-10M editor

A browser editor and librarian for the Casio VZ-10M (also reads VZ-1 dumps), over Web MIDI SysEx. Sibling of `~/Desktop/sound/windchime`. Same stack, same UI rules.

## Commands

- `pnpm dev`, `pnpm build`
- `pnpm test`: codec tests (`node --test`, which runs the `.ts` files directly). Any `.syx` in `fixtures/` must round-trip byte for byte.
- `pnpm typecheck`: `tsc --noEmit`. Must be clean; `pnpm build` type-checks too.
- `pnpm relay`: the Relay compiler; writes `__generated__/` and `lib/server/persisted-operations.json` (both git-ignored). `dev` and `build` run it.
- `pnpm schema:pull`: refresh `schemas/dmbk-graphql-api.graphql` from the API, then commit it.
- `pnpm banks`: bundles `worker/banks-worker.ts` into `public/vz-banks.js` and copies `sqlite3.wasm` beside it (both git-ignored). `dev` and `build` run it.
- Don't run `pnpm build` while `pnpm dev` is running: it overwrites `.next` and the dev server starts returning 500s. Restart dev with `rm -rf .next` if that happens.

## Layout

- `lib/vz/sysex.ts`: framing, nibbles, checksum, splitting `.syx` files.
- `lib/vz/params.ts`: the field tables (byte, mask, range) for the 336-byte voice and the 100-byte operation. The UI and codec are generated from these.
- `lib/vz/codec.ts`: `get` / `set` / `setMany` / `getName` / `setName` on the decoded bytes, `toSysex`, `fromSyx` / `toSyx`, `initVoice`.
- `lib/midi.ts`: Web MIDI in and out with SysEx, ported from windchime's `lib/midiout.js`.
- `lib/store.ts`: localStorage under `vz10m.*`, plus the library.
- `lib/vz/engine/`: the emulator, which runs in Node and in the AudioWorklet.
  - `convert.ts` is the calibration file: every stored value → rate / gain / Hz curve, all ESTIMATES.
  - `patch.ts`: voice bytes → `Patch`, converted once per voice change.
  - `engine.ts`: 16 voices × 8 modules; `render()` must never allocate.
- `worklet/vz-processor.ts`: bundled by esbuild into `public/vz-worklet.js` (git-ignored). `pnpm worklet` builds it; `dev` and `build` run it first.
- `lib/audio.ts`: starts audio inside a click, forwards the voice and notes to the worklet, and applies the output device (`setSinkId`, typed in `types/audio-sink.d.ts`).
- `lib/play.ts`: the note router. PLAY TO goes to the emulator, the VZ or both, held keys are counted per source, and it is tested in Node.
- `lib/router.ts`: the app's instance of it. Every note played from the page goes through it.
- `components/KeyboardFloater.tsx`: the draggable KEYS panel (2 octaves, OCTAVE, VELOCITY, PLAY TO). It's loaded with `next/dynamic`, and its settings are stored under `vz10m.keys.*`.
- `lib/help.ts` + `components/Info.tsx`: the (?) popovers. Entries are written in our own words from the manual, citing pages (don't paste manual text), with an "in this editor" note where the emulator estimates. Add `info="key"` to a `Param` / `Check` / `FieldRow` to place one.
- `scripts/render.ts`: `node scripts/render.ts voice.syx 60 1 out.wav` renders a note offline.
- `components/Library.tsx`: the LIBRARY sheet, tabs LOCAL / SHARED / BANKS (the tab and the chosen bank are stored as `vz10m.library.tab` and `vz10m.banks.active`). SHARED and BANKS are their own `next/dynamic` chunks.
- `components/Shared.tsx`: the public list through Relay (`dmbkSoundVzVoices` and the save/update/delete mutations of dmbk-graphql-api's `vz-voices`). `app/api/graphql/route.ts` is the only way to the API: same-origin POSTs of persisted ids, forwarded with `DMBK_GRAPHQL_API_KEY` and `x-end-user-ip` (copied from windchime; see its CLAUDE.md). `lib/relay/environment.ts` raises the API's code as `ApiError`.
- `lib/device.ts`: the device key (32 random bytes, base64url, `vz10m.deviceKey`) that makes shared voices "yours". Made on the first share. The API stores only its hash. Never put it in a URL.
- `lib/vz/names.ts`: a copy of the API's obscene-name check (`obscenity` + spelled-out letters), so SHARE and RENAME refuse at once. Keep it in step with dmbk-graphql-api's `src/lib/vz/names.ts`.
- `lib/banks/db.ts`: every bank query, on any SQLite `Database` (schema v1 by `PRAGMA user_version`; add migration steps, never edit v1). `worker/banks-worker.ts` opens it on OPFS's SAH-pool VFS (no COOP/COEP needed; one tab at a time, others fall back to memory with a warning). `lib/banks/client.ts` is the page's promise wrapper.
- `lib/files.ts`: `download` and `.syx` file names.
- `components/Editor.tsx` is the one client root. `components/Library.tsx` loads through `next/dynamic`. `components/params.tsx` holds the row vocabulary (`Param`, `ParamSlider`, `ParamSelect`, `Check`, `FieldRow`).

## Constraints and decisions to keep

- **TypeScript, strict.** All code is TS (the user wants every project in TS), even where it's copied from JS repos like windchime.
  - `noUncheckedIndexedAccess` is on.
  - `erasableSyntaxOnly`, so Node can run `lib/` and the tests without a build step. That means no enums and no parameter properties.
  - Imports inside `lib/` use explicit `.ts` extensions (`allowImportingTsExtensions`), so Node resolves them.
  - Look fields up with `voiceField(key)`, which throws on an unknown key, rather than indexing `VOICE_FIELD`.
- **Bytes are the source of truth.** A voice is its decoded `Uint8Array(336)`. Edits go through `set()` and touch only that field's bits; never rebuild a voice from params. This keeps unknown bits intact and is the shape the API will store.
- **Don't guess the format.** Every byte layout in `params.ts` comes from a cited source (`openspec/specs/vz-sysex`, and `design.md` in `openspec/changes/archive/2026-11-18-vz10m-editor-sysex`). Conflicting facts are marked `unverified: true` until a hardware dump settles them. The VZ-10M has no dump-request message (owner's manual p.89): selecting a sound on the VZ with EXCLUSIVE=ENA transmits it. Bulk SAVE/LOAD exists (MENU 3-02), but its byte format isn't documented in the manual, so it isn't implemented.
- **Raw values in the UI** until the panel-scale conversions are confirmed. Only give a field `display` where a source states the conversion.
- **SSR:** `lib/*` never touches `window`, `document`, `navigator` or `localStorage` at module top level. Capability checks and storage reads happen in a mount effect. Listeners return unsubscribe functions (strict mode).
- **MIDI access only on a click** (CONNECT MIDI), with `sysex: true`. Chrome/Edge only in practice; Safari has no Web MIDI.
- **UI = windchime's 1-bit language:**
  - every token `#000`/`#fff`, `--radius: 0`, no shadows, no dark mode
  - Knif Mono as `--font-ui`; uppercase labels; text instead of icons
  - `LABEL ..... value` rows with the control beneath
  - dashed 1px focus outline; inverted hover/pressed
  - shadcn: `pnpm dlx shadcn@4.23.0 add <name>`, then strip `rounded-*`, `shadow-*`, `ring-*`, `dark:*`
- **Changelog:** every shipped change adds a line at the top of `lib/changelog.ts`.
- **OpenSpec:** features go through `openspec/changes/<name>/` (proposal, design, tasks, spec deltas) and are archived when done.

## Testing in a browser

Stub `navigator.requestMIDIAccess` with one fake input/output pair (an `addInitScript` in Playwright). Record `output.send` calls, and call the input's `onmidimessage` with a dump to play the VZ. Check for:
- no console errors or hydration warnings
- no horizontal scroll at 390 px

For SHARED, answer `**/api/graphql` with `context.route` by operation name (look the posted id up in `lib/server/persisted-operations.json`), so tests never write to the production list. BANKS runs on the real worker and OPFS in headless Chromium.

## Roadmap

1. Editor + SysEx: done and archived (`openspec/specs/vz-sysex`, `voice-editor`, `midi-io`, `library`). The hardware checks (fixtures, the flagged fields, sending, bulk transfer) are in issue #1.
2. iPD emulator: archived (`openspec/specs/vz-engine`, `audio-output`; the estimates table is in the archived change's `design.md`). Steps 1–4 are done: every voice parameter is played, with semantics from the VZ-10M owner's manual (MENU 1, pp.35–50), and every curve is in `convert.ts` (sourced or ESTIMATE). Step 5 is done: the real worklet in Chrome runs the worst case at about 5% of one core (no WebAssembly needed), and AUDIO picks the output device. Calibration against the hardware is issue #1, for later. The manual PDF is at https://static.wikitide.net/circuitbendingwiki/a/ad/Casio_VZ10M_Owners_Manual.pdf (a scan; the MIDI implementation chart it refers to isn't included).
3. Sharing and banks: done, checked on production 2026-11-18, archived (`openspec/specs/shared-voices`, `openspec/specs/banks`). Voices only go to dmbk-graphql-api (`dmbk-sound.vz_voices`), anonymously, owned by a device key: no accounts, by the user's choice. Banks stay on the device in SQLite.
