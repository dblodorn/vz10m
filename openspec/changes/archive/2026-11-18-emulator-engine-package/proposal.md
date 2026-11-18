# Proposal

## Why

The VZ emulator (`lib/vz/engine/` plus the AudioWorklet) only lives inside this editor, so windchime and any other app can't use it as a sound source. Packaging it now, while there is one engine, sets the pattern that later emulators (a DX7, say) follow: a repo per instrument holding its editor and a published engine package.

## What Changes

- **BREAKING (repo layout):** the repo becomes a pnpm workspace. The Next.js editor moves to `apps/editor`, and the engine moves to `packages/casio-vz-engine`. Every path and command in `CLAUDE.md`/`AGENTS.md`, the Vercel project's root directory and the scripts change with it. What users see of the editor does not change.
- New package `@dblodorn/casio-vz-engine`, published to GitHub Packages (the scope has to be the GitHub owner). It is a playback SDK only:
  - a synth that runs in the host's `AudioContext` through its own AudioWorklet: load a voice, note on/off, all notes off, connect to any `AudioNode`;
  - voice loading from 336 decoded bytes, a VZ voice SysEx message or a `.syx` file (read-only: reading fields, parsing and splitting dumps);
  - no editing: no `set`/`setMany`/`setName`, no `initVoice`, no SysEx building or MIDI out.
- Patch sources behind one small interface:
  - a dmbk patch library client (the `dmbkSoundVzVoices` listing: browse, search, fetch one voice's bytes) that takes an endpoint and an API key, or the URL of a proxy the host app runs. It sends plain `fetch` requests, without Relay;
  - bring your own library: anything that implements the interface (local files, the host's own store) works the same way.
- Getting access to the dmbk library is like any SDK: another developer asks for an API key, or brings their own patches. The package never ships a key, and its docs say the key belongs on a server, not in browser code.
- The editor uses the package from the workspace for its emulator (SOUND, the KEYS panel, `scripts/render.ts`), so this repo is its first consumer. Windchime comes later, as a separate change in that repo.
- A written convention for emulator packages: naming (`@dblodorn/<manufacturer>-<model>-engine`, so `casio-vz-engine` and later `yamaha-dx7-engine`), the shared synth and patch-source shape, the worklet packaging, and the publishing and versioning steps. A DX7 package would follow it. There is no shared base package until a second engine exists.

## Capabilities

### New Capabilities
- `casio-vz-engine-sdk`: the published package's public API: creating a synth in an `AudioContext`, loading voices (bytes, SysEx, `.syx`), playing notes, the patch-source interface, the dmbk library client and its key requirement, and the absence of editing.
- `engine-packages`: the convention every emulator package in this family follows: name, workspace layout, the common synth/patch-source surface, worklet delivery, publishing to GitHub Packages and versioning.

### Modified Capabilities
None. `vz-engine` and `audio-output` keep their requirements. The engine moves and the editor reaches it through the package, but what it plays and how SOUND and AUDIO behave don't change. `shared-voices` is unchanged: the editor keeps its Relay client and `/api/graphql` route for sharing, renaming, updating and deleting.

## Impact

- **Code:** `lib/vz/engine/*`, the read side of `lib/vz/sysex.ts`/`codec.ts`/`params.ts`, and `worklet/*` move into `packages/casio-vz-engine`. The editor keeps the editing parts (`set`, `toSysex`, `initVoice`) and imports the field tables from the package, so there is still one field table. `lib/audio.ts` becomes a thin wrapper over the package's synth. The engine tests move with the engine.
- **Tooling:** a root `pnpm-workspace.yaml` with `apps/*` and `packages/*`. The package gets its own build (esbuild for the worklet, `tsc` for type declarations) and a GitHub Actions workflow that publishes on a version tag. Consumers outside this repo need an `.npmrc` with `@dblodorn:registry=https://npm.pkg.github.com` and a token that can read packages.
- **Deployment:** the Vercel project's root directory changes to `apps/editor`, and its env vars (`DMBK_GRAPHQL_API_KEY`) stay where they are.
- **dmbk-graphql-api (outside this repo):** today the API answers the voice listing without a key, so "ask for a key to use the library" is enforced only by convention. Requiring a key for reads, with keys handed out per developer, is a change in that repo and is not part of this one.
- **Windchime:** nothing changes until it adds the package in its own change.
