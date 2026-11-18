# Tasks

## 1. Workspace

- [x] 1.1 Add `pnpm-workspace.yaml` with `apps/*` and `packages/*` (keep `allowBuilds`), a private root `package.json` whose `dev`, `build`, `test` and `typecheck` fan out with `pnpm -r`/`--filter`, and `tsconfig.base.json` holding the strict options. Verify: `pnpm install` at the root succeeds.
- [x] 1.2 `git mv` the app (`app/`, `components/`, `lib/`, `scripts/`, `test/`, `types/`, `worker/`, `worklet/`, `public/`, `schemas/`, `fixtures/`, the Next/Relay/PostCSS/shadcn configs, `next-env.d.ts`, `.env.local`) into `apps/editor`. Its `tsconfig.json` extends the base. Verify: `pnpm dev` serves the editor with SOUND, KEYS, SHARED and BANKS working, and `pnpm test`, `pnpm typecheck` and `pnpm build` pass from the root with no other code change. `git log --follow apps/editor/lib/vz/engine/engine.ts` shows the old history.

## 2. Package skeleton and the move

- [x] 2.1 Create `packages/casio-vz-engine` with a `package.json`:
  - `exports` pointing at `src/index.ts`, and `publishConfig` holding the `dist` exports and `https://npm.pkg.github.com`;
  - `repository` set to `dblodorn/vz10m`;
  - its own `tsconfig.json` extending the base;
  - `test`, `typecheck`, `build:worklet` and `build` scripts.

  Verify: `pnpm -F @dblodorn/casio-vz-engine typecheck` passes on an empty `index.ts`.
- [x] 2.2 `git mv` `lib/vz/engine/*` into the package's `src/engine/`, `lib/vz/params.ts` into `src/`, and the worklet processor and message types into `src/worklet/`. Give the processor a package-specific name (`casio-vz-engine`). Verify: the package's typecheck passes.
- [x] 2.3 Split the codec as design decision 2 describes:
  - the read side (`get`, `getName`, `toParams`, `parse`, `splitMessages`, `isVz`, `checksum`, `denibblize`, the constants, `fromSyx`) goes into the package, plus a new `readVoice`;
  - the write side (`set`, `setMany`, `setName`, `frame`, `nibblize`, `toSysex`, `toSyx`, `initVoice`, `initOperation`) stays in `apps/editor/lib/vz/`, importing from the package.

  Verify: a test in the package asserts that no export writes to a voice or returns a SysEx frame.
- [x] 2.4 Add the package to the editor as `workspace:*` and to `transpilePackages`, and point every import at it. Move the engine, oscillators, lines and modulation tests and the read half of `vz.test.ts` into the package. The write half and the play, banks and sharing tests stay in the editor. Verify: `pnpm test` runs both suites (with `--expose-gc`, no allocation tests skipped), `pnpm typecheck` is clean, and `pnpm dev` still plays. If `transpilePackages` with `.ts` imports fails, stop and switch to design decision 3's alternative before going on.

## 3. Synth API

- [x] 3.1 `build:worklet`: esbuild bundles the processor into `dist/worklet.js` and the git-ignored `src/worklet/code.generated.ts` (the code as a string). Verify: running it produces both files, and the string loads as a module.
- [x] 3.2 Write the shared validation (`readVoice`, note 0–127, velocity 0–127 with 0 as note-off) and `createOfflineSynth(sampleRate)`. Verify with package tests:
  - 1 s of note 60 at 44 100 Hz returns 44 100 samples that aren't all zero;
  - 335 bytes is refused and the previous voice keeps playing;
  - note 128 is refused;
  - velocity 0 releases the note;
  - a `.syx` file with a bad second message returns voices 1 and 3 and an error at position 1;
  - operation messages are reported as operations.
- [x] 3.3 `createSynth(ctx, { workletUrl? })`: loads the worklet from a Blob URL by default (once per context, cached in a `WeakMap`), validates on the main thread, and offers `output`, `loadVoice`, `noteOn`, `noteOff`, `allNotesOff` and `dispose`. It never creates, resumes or closes the context. Verify in headless Chromium with an `OfflineAudioContext`:
  - it renders sound after a note-on;
  - two synths with different voices give different outputs, and note-off on one leaves the other sounding;
  - `workletUrl` loads from a served file.
- [x] 3.4 Move the editor onto the package:
  - `lib/audio.ts` keeps its context, device and suspend logic and uses `createSynth`;
  - `scripts/render.ts` uses `createOfflineSynth`;
  - drop the editor's `worklet` script and `public/vz-worklet.js`, and have `dev`/`build` run the package's `build:worklet`.

  Verify:
  - `scripts/render.ts` gives a WAV identical to one rendered before this change, for the same voice and note;
  - a browser check (stubbed MIDI) shows SOUND, KEYS and AUDIO working, with no console errors or hydration warnings.

## 4. Patch sources

- [x] 4.1 The `PatchSource` type, plus a test that a hand-written in-memory source loads into the offline synth and renders exactly what loading its bytes directly does.
- [x] 4.2 `dmbkLibrary({ endpoint, apiKey?, fetch? })`:
  - fixed query text for the list (`dmbkSoundVzVoices`) and get (`node(id) … on VzVoice`) operations;
  - in direct mode, the key goes in `x-api-key`; in proxy mode, it sends `{ op, variables }` with no key;
  - API errors are thrown as `DmbkError` with the API's code.

  Verify with a stubbed `fetch`:
  - the key is in a header and never in a URL;
  - proxy mode sends no key header;
  - a 13-character search is refused with no request sent;
  - data that isn't 336 bytes is refused;
  - creating it with no endpoint throws an error that names the missing endpoint.
- [x] 4.3 `createDmbkProxyHandler({ apiKey, endpoint? })`: accepts only same-origin POSTs of `list`/`get` with variables in range, and forwards the matching fixed query with the key. Verify with `Request` objects and a stubbed upstream:
  - a cross-site POST, an unknown op, `first` 21 and query text are each refused;
  - a valid list is forwarded with `x-api-key`.

## 5. Build, docs and publishing

- [x] 5.1 `build`: `tsc` with `declaration` and `rewriteRelativeImportExtensions` into `dist/`, plus `build:worklet`. Verify: `dist/index.js` imports only `.js` paths, and `dist/index.d.ts` exists.
- [x] 5.2 Smoke test script: `pnpm pack` the package, install the tarball into a scratch project outside the workspace, import it and render a note through `createOfflineSynth`. Verify: it passes locally, and fails if the `dist` exports are broken (checked once by breaking them on purpose).
- [x] 5.3 The package `README.md`:
  - install, including the `.npmrc` for GitHub Packages and a `read:packages` token;
  - starting audio on a click, `createSynth`, loading a voice, notes;
  - `workletUrl` for strict CSP;
  - patch sources: bring your own, or the dmbk library;
  - that a key is issued on request and belongs on a server or behind `createDmbkProxyHandler`;
  - a Next.js route example.

  Add a `CHANGELOG.md` with 0.1.0. Verify: following the README in a scratch Next.js app plays a voice with no copied files or bundler changes.
- [x] 5.4 `.github/workflows/publish-casio-vz-engine.yml`:
  - triggered by tags `casio-vz-engine@*`, with `packages: write`;
  - checks the tag against the package version;
  - runs typecheck, test, build and the smoke test, then `pnpm publish --filter` with `GITHUB_TOKEN`.

  Verify: a run on a test tag with a deliberately failing test publishes nothing, and a mismatched tag fails.

## 6. Convention and docs

- [x] 6.1 Update `CLAUDE.md` and `AGENTS.md`:
  - new paths and commands, run from the root;
  - the package and how the editor consumes it from source;
  - the read/write split rule;
  - the `[manufacturer]-[model]-engine` convention, with the common surface and publishing steps, as the reference a DX7 repo copies.

  Add a line to `apps/editor/lib/changelog.ts`. Verify: every path named in `CLAUDE.md` exists.

## 7. Deploy and release

- [x] 7.1 Set the Vercel project's root directory to `apps/editor` (ask the user, since it's a project setting), deploy a preview, and check SOUND, KEYS, SHARED (list and open) and BANKS on it. Then promote to production after the user approves. Verify: production serves the editor and SHARED lists voices.
- [x] 7.2 Once the user approves, push the tag `casio-vz-engine@0.1.0`. Verify:
  - the workflow publishes `@dblodorn/casio-vz-engine@0.1.0` to GitHub Packages;
  - installing it with a `read:packages` token in a scratch project renders a note.
