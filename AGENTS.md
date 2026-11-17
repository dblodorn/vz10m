# VZ-10M editor

A browser editor and librarian for the Casio VZ-10M (also reads VZ-1 dumps), over Web MIDI SysEx. Sibling of `~/Desktop/sound/windchime`. Same stack, same UI rules.

## Commands

- `pnpm dev`, `pnpm build`
- `pnpm test`: codec tests (`node --test`, which runs the `.ts` files directly). Any `.syx` in `fixtures/` must round-trip byte for byte.
- `pnpm typecheck`: `tsc --noEmit`. Must be clean; `pnpm build` type-checks too.
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
- `lib/audio.ts`: starts audio inside a click and forwards the voice and notes to the worklet.
- `scripts/render.ts`: `node scripts/render.ts voice.syx 60 1 out.wav` renders a note offline.
- `components/Editor.tsx` is the one client root. `components/Library.tsx` loads through `next/dynamic`. `components/params.tsx` holds the row vocabulary (`Param`, `ParamSlider`, `ParamSelect`, `Check`, `FieldRow`).

## Constraints and decisions to keep

- **TypeScript, strict.** All code is TS (the user wants every project in TS), even where it's copied from JS repos like windchime.
  - `noUncheckedIndexedAccess` is on.
  - `erasableSyntaxOnly`, so Node can run `lib/` and the tests without a build step. That means no enums and no parameter properties.
  - Imports inside `lib/` use explicit `.ts` extensions (`allowImportingTsExtensions`), so Node resolves them.
  - Look fields up with `voiceField(key)`, which throws on an unknown key, rather than indexing `VOICE_FIELD`.
- **Bytes are the source of truth.** A voice is its decoded `Uint8Array(336)`. Edits go through `set()` and touch only that field's bits; never rebuild a voice from params. This keeps unknown bits intact and is the shape the API will store.
- **Don't guess the format.** Every byte layout in `params.ts` comes from a cited source (`openspec/specs/vz-sysex`, and the change's `design.md`). Conflicting facts are marked `unverified: true` until a hardware dump settles them. The VZ-10M has no dump-request message (owner's manual p.89): selecting a sound on the VZ with EXCLUSIVE=ENA transmits it. Bulk SAVE/LOAD exists (MENU 3-02), but its byte format isn't documented in the manual, so it isn't implemented.
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

## Roadmap

1. Editor + SysEx (`openspec/changes/vz10m-editor-sysex`). Open: hardware fixtures, verifying the flagged fields, the send request and bulk transfer.
2. iPD emulator (`openspec/changes/vz10m-emulator`). Step 1 is done: sine modules, DCA envelopes, 16-voice pool, SOUND toggle. Next: waveforms, detune, lines, modulation, then calibration against the hardware.
3. Save voices, operations and banks to MongoDB through dmbk-graphql-api (`dmbkSoundVz*` types, owner-scoped, raw SysEx stored). Copy windchime's Relay pipeline and add Google sign-in.
