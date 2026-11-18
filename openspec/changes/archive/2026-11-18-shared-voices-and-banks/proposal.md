# Proposal

## Why

Voices made in vz10m stay in the browser that made them. People want to share voices publicly, come back to change their own, and gather voices into banks, without accounts.

## What Changes

- **SHARED tab** in LIBRARY: the public list of VZ voices stored by dmbk-graphql-api (`dmbkSoundVzVoices`, its `vz-voices` change). Anyone can browse, search and OPEN. SHARE CURRENT saves the voice being edited. Voices shared from this browser are marked YOURS and can be renamed, updated with the current voice, or deleted.
- **Device key** (`lib/device.ts`): a random 32-byte secret, base64url, made by the browser on its first share and kept in localStorage. The API stores only its hash. DEVICE KEY shows, copies and replaces it, so ownership can move to another browser.
- **Name check before sending** (`lib/vz/names.ts`): the same `obscenity` check the API runs, so a refused name is reported at once. The API's answer still decides.
- **BANKS tab**: banks of 64 voice slots in SQLite on this device (`@sqlite.org/sqlite-wasm` in a module worker, OPFS SAH-pool VFS). New, rename, delete, import .syx (into one bank per 64 voices), export .syx (the filled slots in order), PUT CURRENT, OPEN, SEND, EMPTY and move a slot up or down. ADD TO BANK in LOCAL and SHARED fills the chosen bank's first empty slot.
- **Relay pipeline** copied from windchime: `app/api/graphql/route.ts` forwards only persisted operations, adding `DMBK_GRAPHQL_API_KEY` and the visitor's IP; `lib/relay/environment.ts`; `pnpm relay`, `pnpm schema:pull`; `schemas/dmbk-graphql-api.graphql`.

## Capabilities

### New Capabilities
- `shared-voices`: browsing, sharing and managing your own voices in the public list.
- `banks`: 64-slot banks kept on the device.

## Impact

- New: `components/Shared.tsx`, `components/Banks.tsx`, `lib/device.ts`, `lib/vz/names.ts`, `lib/banks/` (`db.ts`, `client.ts`), `worker/banks-worker.ts`, `worker/banks-messages.ts`, `lib/files.ts`, `app/api/graphql/route.ts`, `lib/relay/environment.ts`, `scripts/relay.ts`, `scripts/fetch-api-schema.ts`, `relay.config.json`, `schemas/`.
- Changed: `components/Library.tsx` (tabs), `next.config.ts` (Relay compiler), `package.json` (`relay`, `banks`, `schema:pull`; dev and build run them), `.gitignore`, `lib/help.ts`.
- Dependencies: `react-relay`, `relay-runtime`, `obscenity`, `@sqlite.org/sqlite-wasm`; dev: `relay-compiler`, `get-graphql-schema`, Relay types.
- Ops: `DMBK_GRAPHQL_API_KEY` (the `vz10m` key) is set in Vercel for Production, Preview and Development, and in `.env.local`.
- Supersedes the roadmap's "add Google sign-in" and "operations and banks in Mongo": the user chose anonymous saving with a device key, voices only in the API, and banks on the device.
