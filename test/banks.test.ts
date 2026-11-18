import { test } from "node:test";
import assert from "node:assert/strict";
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import * as B from "../lib/banks/db.ts";
import * as V from "../lib/vz/codec.ts";

const sqlite3 = await sqlite3InitModule();

function open() {
  const db = new sqlite3.oo1.DB(":memory:");
  B.migrate(db);
  return db;
}
const named = (name: string) => V.setName(V.initVoice(), name);

test("migrate is idempotent and sets user_version 1", () => {
  const db = open();
  B.migrate(db);
  assert.equal(Number(db.selectValue("PRAGMA user_version")), 1);
});

test("create, list, get: slots come back in order, empty ones null", () => {
  const db = open();
  const id = B.createBank(db, "  my bank ", [named("ONE"), named("TWO")]);
  const [summary] = B.listBanks(db);
  assert.equal(summary?.name, "MY BANK");
  assert.equal(summary?.filled, 2);
  const bank = B.getBank(db, id)!;
  assert.equal(bank.slots.length, 64);
  assert.equal(V.getName(bank.slots[0]!), "ONE");
  assert.equal(V.getName(bank.slots[1]!), "TWO");
  assert.equal(bank.slots[2], null);
  assert.equal(B.getBank(db, "missing"), null);
});

test("names: trimmed, upper case, capped, never empty", () => {
  assert.equal(B.cleanName(" "), "UNTITLED BANK");
  assert.equal(B.cleanName("x".repeat(40)).length, B.NAME_MAX);
});

test("setSlot puts, replaces and clears; addVoice fills the first gap", () => {
  const db = open();
  const id = B.createBank(db, "A");
  B.setSlot(db, id, 0, named("A"));
  B.setSlot(db, id, 0, named("B"));
  B.setSlot(db, id, 2, named("C"));
  assert.equal(B.addVoice(db, id, named("D")), 1);
  B.setSlot(db, id, 2, null);
  const bank = B.getBank(db, id)!;
  assert.deepEqual(bank.slots.slice(0, 3).map(s => s && V.getName(s)), ["B", "D", null]);
});

test("addVoice on a full bank returns -1", () => {
  const db = open();
  const id = B.createBank(db, "FULL", Array.from({ length: 64 }, () => named("X")));
  assert.equal(B.addVoice(db, id, named("Y")), -1);
});

test("swapSlots moves voices, including into an empty slot", () => {
  const db = open();
  const id = B.createBank(db, "S", [named("ONE"), named("TWO")]);
  B.swapSlots(db, id, 0, 1);
  B.swapSlots(db, id, 1, 10);
  const bank = B.getBank(db, id)!;
  assert.equal(V.getName(bank.slots[0]!), "TWO");
  assert.equal(bank.slots[1], null);
  assert.equal(V.getName(bank.slots[10]!), "ONE");
});

test("bad input is refused: wrong length, slot out of range, too many voices", () => {
  const db = open();
  const id = B.createBank(db, "R");
  assert.throws(() => B.setSlot(db, id, 0, new Uint8Array(335)), RangeError);
  assert.throws(() => B.setSlot(db, id, 64, named("X")), RangeError);
  assert.throws(() => B.createBank(db, "BIG", Array.from({ length: 65 }, () => named("X"))), RangeError);
});

test("rename and delete; deleting a bank removes its slots", () => {
  const db = open();
  const id = B.createBank(db, "OLD", [named("ONE")]);
  B.renameBank(db, id, "new");
  assert.equal(B.getBank(db, id)?.name, "NEW");
  B.deleteBank(db, id);
  assert.equal(B.listBanks(db).length, 0);
  assert.equal(Number(db.selectValue("SELECT count(*) FROM slots")), 0);
});
