## 1. API client

- [x] 1.1 Copy windchime's Relay pipeline (route, environment, scripts, config, schema); `pnpm relay` in dev and build
- [x] 1.2 `DMBK_GRAPHQL_API_KEY` in Vercel (Production, Preview, Development) and `.env.local`

## 2. Shared voices

- [x] 2.1 `lib/device.ts`: make, read and replace the device key
- [x] 2.2 `lib/vz/names.ts`: the API's name check
- [x] 2.3 `components/Shared.tsx`: list, ALL/YOURS, search, YOURS mark, SHARE CURRENT, RENAME, UPDATE, DELETE (confirm), DEVICE KEY

## 3. Banks

- [x] 3.1 `lib/banks/db.ts` (schema v1 and every query), tested in Node on an in-memory database
- [x] 3.2 `worker/banks-worker.ts` (OPFS SAH pool, in-memory fallback) and `lib/banks/client.ts`; `pnpm banks` builds it
- [x] 3.3 `components/Banks.tsx`; ADD TO BANK in LOCAL and SHARED

## 4. Checks and docs

- [x] 4.1 `pnpm test` and `pnpm typecheck` pass
- [x] 4.2 Browser check with a stubbed API: share, repeat share, YOURS filter, search, refused and accepted rename, delete, device key, banks (new, put, add, move, export, reload), 390 px, no console errors
- [x] 4.3 A read through the local route to the live API, and cross-site refusal
- [x] 4.4 Changelog, help, CLAUDE.md
- [ ] 4.5 A real share, rename and delete on production after deploy
- [ ] 4.6 Archive this change
