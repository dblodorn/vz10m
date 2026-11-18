# Design

## Decisions

**Device key, not accounts, IP or fingerprinting.** The user wanted no auth. An IP changes and is shared; a browser fingerprint is unreliable and tracking. A random key is private, needs no server state but a hash, and can be copied between browsers. The cost: clear site data without a copy and the voices can't be changed any more (they stay public). The DEVICE KEY panel says so. The key is made on the first SHARE, not on load, so browsing stores nothing.

**The key travels in GraphQL variables** through the same-origin proxy, never in a URL. `yours(creatorKey)` is asked with the key (or `""` before there is one, which the API answers false), so one listing query marks your rows.

**Relay as in windchime.** Persisted operations only; the route adds the API key and `x-end-user-ip`. The list is one `@connection` keyed by `creatorKey` and `search`; its `__id` is read from the query so delete can `@deleteEdge` from the list being shown. A save is prepended by an updater unless the list already has it (a repeat save returns the stored voice) or a search is active. Update relies on normalization by id.

**Names checked twice.** `lib/vz/names.ts` is a copy of the API's rule, so the UI can refuse at once. The API's check is authoritative; its `BAD_USER_INPUT` message is shown if they ever disagree.

**SQLite in a worker, on OPFS's SAH pool.** The SAH-pool VFS needs no COOP/COEP headers (the "opfs" VFS does), so the page keeps working with third-party embeds and Vercel's defaults. It holds the file exclusively, so a second tab can't open it: that tab falls back to an in-memory database and shows a warning instead of failing. The worker and `sqlite3.wasm` (≈ 0.9 MB) load only when BANKS is opened (or ADD TO BANK is pressed). `lib/banks/db.ts` holds all SQL and takes a `Database`, so Node tests run it on an in-memory database with the same package.

**Schema.** `banks(id, name, created_at, updated_at)` and `slots(bank_id, slot 0–63, data BLOB of 336 bytes)` with `ON DELETE CASCADE`, versioned with `PRAGMA user_version` (1). A later version adds a migration step; v1 is never edited.

**Export, not transfer.** The VZ's bulk SAVE/LOAD format (MENU 3-02) isn't documented in the manual, so EXPORT writes the filled slots as single-voice dumps in one file, and SEND sends one voice to the compare/recall area. Bank transfer can come later from a hardware capture.

## Risks

- OPFS storage can be evicted by the browser under storage pressure; export is the backup.
- The name filter can over- or under-block; the API decides, and admins can hide.
