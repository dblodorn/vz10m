// The page's side of the banks worker (worker/banks-worker.ts): one worker for the page's lifetime, started on the
// first call, and a promise per request. Browser-only; nothing runs at module top level.
import type { Calls, Op, Request, Response } from "../../worker/banks-messages.ts";

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

function start(): Worker {
  const w = new Worker("/vz-banks.js", { type: "module" });
  w.onmessage = (e: MessageEvent<Response>) => {
    const p = pending.get(e.data.id);
    if (!p) return;
    pending.delete(e.data.id);
    if (e.data.ok) p.resolve(e.data.result); else p.reject(new Error(e.data.error));
  };
  w.onerror = e => {
    for (const p of pending.values()) p.reject(new Error(e.message || "The banks worker failed."));
    pending.clear();
    worker = null; // the next call starts a new one
  };
  return w;
}

export function call<K extends Op>(op: K, ...args: Calls[K]["args"]): Promise<Calls[K]["result"]> {
  worker ??= start();
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    worker!.postMessage({ id, op, args } as Request);
  });
}
