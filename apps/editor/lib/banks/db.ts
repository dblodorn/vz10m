// Banks: 64-slot sets of voices, kept on this device in SQLite (the browser's copy lives in OPFS, through
// worker/banks-worker.ts). Everything here takes an open `Database`, so the same code runs in the worker and in
// Node tests against an in-memory database. A slot holds a voice's decoded 336 bytes, or nothing.

import type { Database } from "@sqlite.org/sqlite-wasm";
import { VOICE_BYTES } from "../vz/sysex.ts";

export const SLOTS = 64;
export const NAME_MAX = 24;

export interface BankSummary { id: string; name: string; filled: number; updatedAt: string }
export interface Bank { id: string; name: string; slots: (Uint8Array | null)[]; updatedAt: string }

// Version 1. A later schema adds a step to `migrate`; never edit this one.
const SCHEMA_V1 = `
  CREATE TABLE banks (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE slots (
    bank_id TEXT NOT NULL REFERENCES banks(id) ON DELETE CASCADE,
    slot INTEGER NOT NULL CHECK (slot BETWEEN 0 AND ${SLOTS - 1}),
    data BLOB NOT NULL CHECK (length(data) = ${VOICE_BYTES}),
    PRIMARY KEY (bank_id, slot)
  );
`;

export function migrate(db: Database): void {
  db.exec("PRAGMA foreign_keys = ON");
  const version = Number(db.selectValue("PRAGMA user_version") ?? 0);
  if (version < 1) db.transaction(t => { t.exec(SCHEMA_V1); t.exec("PRAGMA user_version = 1"); });
}

/** Trimmed, upper case, at most NAME_MAX characters; empty becomes "UNTITLED BANK". */
export const cleanName = (name: string): string => name.trim().toUpperCase().slice(0, NAME_MAX) || "UNTITLED BANK";

const now = (): string => new Date().toISOString();
const newId = (): string => crypto.randomUUID();

function checkSlot(slot: number): void {
  if (!Number.isInteger(slot) || slot < 0 || slot >= SLOTS) throw new RangeError(`slot ${slot} is not 0–${SLOTS - 1}`);
}
function checkVoice(data: Uint8Array): void {
  if (data.length !== VOICE_BYTES) throw new RangeError(`a voice is ${VOICE_BYTES} bytes, got ${data.length}`);
}
const touch = (db: Database, id: string): void => { db.exec({ sql: "UPDATE banks SET updated_at = ? WHERE id = ?", bind: [now(), id] }); };

export function listBanks(db: Database): BankSummary[] {
  return db.selectObjects(
    `SELECT b.id, b.name, b.updated_at AS updatedAt, (SELECT count(*) FROM slots s WHERE s.bank_id = b.id) AS filled
     FROM banks b ORDER BY b.updated_at DESC, b.id`,
  ).map(r => ({ id: String(r.id), name: String(r.name), filled: Number(r.filled), updatedAt: String(r.updatedAt) }));
}

export function getBank(db: Database, id: string): Bank | null {
  const row = db.selectObject("SELECT id, name, updated_at AS updatedAt FROM banks WHERE id = ?", [id]);
  if (!row) return null;
  const slots: (Uint8Array | null)[] = Array.from({ length: SLOTS }, () => null);
  for (const s of db.selectObjects("SELECT slot, data FROM slots WHERE bank_id = ?", [id])) {
    slots[Number(s.slot)] = s.data as Uint8Array;
  }
  return { id: String(row.id), name: String(row.name), slots, updatedAt: String(row.updatedAt) };
}

/** A new bank, empty or filled from `voices` in slot order (at most 64). Returns its id. */
export function createBank(db: Database, name: string, voices: readonly Uint8Array[] = []): string {
  if (voices.length > SLOTS) throw new RangeError(`a bank holds ${SLOTS} voices, got ${voices.length}`);
  voices.forEach(checkVoice);
  const id = newId(), at = now();
  db.transaction(t => {
    t.exec({ sql: "INSERT INTO banks (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)", bind: [id, cleanName(name), at, at] });
    voices.forEach((v, slot) => t.exec({ sql: "INSERT INTO slots (bank_id, slot, data) VALUES (?, ?, ?)", bind: [id, slot, v] }));
  });
  return id;
}

export function renameBank(db: Database, id: string, name: string): void {
  db.exec({ sql: "UPDATE banks SET name = ?, updated_at = ? WHERE id = ?", bind: [cleanName(name), now(), id] });
}

export function deleteBank(db: Database, id: string): void {
  db.exec({ sql: "DELETE FROM banks WHERE id = ?", bind: [id] });
}

/** Put a voice in a slot, or empty it with null. */
export function setSlot(db: Database, id: string, slot: number, data: Uint8Array | null): void {
  checkSlot(slot);
  if (data) checkVoice(data);
  db.transaction(t => {
    if (data) t.exec({ sql: "INSERT INTO slots (bank_id, slot, data) VALUES (?, ?, ?) ON CONFLICT (bank_id, slot) DO UPDATE SET data = excluded.data", bind: [id, slot, data] });
    else t.exec({ sql: "DELETE FROM slots WHERE bank_id = ? AND slot = ?", bind: [id, slot] });
    touch(t, id);
  });
}

/** The first empty slot gets the voice. Returns its slot, or -1 when the bank is full. */
export function addVoice(db: Database, id: string, data: Uint8Array): number {
  checkVoice(data);
  const used = new Set(db.selectValues("SELECT slot FROM slots WHERE bank_id = ?", [id]).map(Number));
  const slot = Array.from({ length: SLOTS }, (_, i) => i).find(i => !used.has(i)) ?? -1;
  if (slot >= 0) setSlot(db, id, slot, data);
  return slot;
}

/** Swap two slots (either may be empty). */
export function swapSlots(db: Database, id: string, a: number, b: number): void {
  checkSlot(a); checkSlot(b);
  if (a === b) return;
  db.transaction(t => {
    // the primary key rules out an in-place swap, so read both, delete both, write both back
    const va = t.selectValue("SELECT data FROM slots WHERE bank_id = ? AND slot = ?", [id, a]) as Uint8Array | undefined;
    const vb = t.selectValue("SELECT data FROM slots WHERE bank_id = ? AND slot = ?", [id, b]) as Uint8Array | undefined;
    t.exec({ sql: "DELETE FROM slots WHERE bank_id = ? AND slot IN (?, ?)", bind: [id, a, b] });
    if (vb) t.exec({ sql: "INSERT INTO slots (bank_id, slot, data) VALUES (?, ?, ?)", bind: [id, a, vb] });
    if (va) t.exec({ sql: "INSERT INTO slots (bank_id, slot, data) VALUES (?, ?, ?)", bind: [id, b, va] });
    touch(t, id);
  });
}
