// Main thread <-> banks worker. Shared by lib/banks/client.ts and worker/banks-worker.ts.
// Each request carries an id; the worker answers it once, with the result or an error message.
import type { Bank, BankSummary } from "../lib/banks/db.ts";

export interface Calls {
  open: { args: []; result: { persistent: boolean } };
  list: { args: []; result: BankSummary[] };
  get: { args: [id: string]; result: Bank | null };
  create: { args: [name: string, voices: Uint8Array[]]; result: string };
  rename: { args: [id: string, name: string]; result: void };
  remove: { args: [id: string]; result: void };
  setSlot: { args: [id: string, slot: number, data: Uint8Array | null]; result: void };
  add: { args: [id: string, data: Uint8Array]; result: number };
  swap: { args: [id: string, a: number, b: number]; result: void };
}
export type Op = keyof Calls;

export type Request = { [K in Op]: { id: number; op: K; args: Calls[K]["args"] } }[Op];
export type Response = { id: number; ok: true; result: unknown } | { id: number; ok: false; error: string };
