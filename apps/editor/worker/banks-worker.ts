// The banks database, in a module worker (bundled by esbuild into public/vz-banks.js; sqlite3.wasm is copied
// beside it). OPFS's SAH-pool VFS keeps the file on this device and needs no cross-origin isolation headers, but
// it holds the file exclusively: a second tab, or a browser without OPFS, gets an in-memory database instead
// and is told its changes won't be kept (`persistent: false`).
import sqlite3InitModule, { type Database } from "@sqlite.org/sqlite-wasm";
import * as B from "../lib/banks/db.ts";
import type { Request, Response } from "./banks-messages.ts";

const FILE = "/vz10m-banks.sqlite3";
let ready: Promise<{ db: Database; persistent: boolean }> | null = null;

async function openDb(): Promise<{ db: Database; persistent: boolean }> {
  const sqlite3 = await sqlite3InitModule();
  let db: Database, persistent = true;
  try {
    const pool = await sqlite3.installOpfsSAHPoolVfs({ name: "vz10m-banks" });
    db = new pool.OpfsSAHPoolDb(FILE);
  } catch {
    db = new sqlite3.oo1.DB(":memory:");
    persistent = false;
  }
  B.migrate(db);
  return { db, persistent };
}

function run(db: Database, req: Request): unknown {
  switch (req.op) {
    case "open": return undefined; // answered below
    case "list": return B.listBanks(db);
    case "get": return B.getBank(db, ...req.args);
    case "create": return B.createBank(db, ...req.args);
    case "rename": return B.renameBank(db, ...req.args);
    case "remove": return B.deleteBank(db, ...req.args);
    case "setSlot": return B.setSlot(db, ...req.args);
    case "add": return B.addVoice(db, ...req.args);
    case "swap": return B.swapSlots(db, ...req.args);
  }
}

self.onmessage = async (e: MessageEvent<Request>) => {
  const req = e.data;
  let res: Response;
  try {
    ready ??= openDb();
    const { db, persistent } = await ready;
    res = { id: req.id, ok: true, result: req.op === "open" ? { persistent } : run(db, req) };
  } catch (err) {
    res = { id: req.id, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  self.postMessage(res);
};
