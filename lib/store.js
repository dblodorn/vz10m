// localStorage under the "vz10m." namespace. Every call is guarded: private windows and blocked storage
// read as empty and drop writes. Never touch storage at module top level (SSR).

const NS = "vz10m.";

export const store = {
  get(k, d) { try { const v = localStorage.getItem(NS + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(NS + k, JSON.stringify(v)); } catch (e) {} },
  remove(k) { try { localStorage.removeItem(NS + k); } catch (e) {} },
};

// Library entries keep the decoded bytes as base64, the same form the API will store (milestone 3).
export const toB64 = bytes => btoa(String.fromCharCode(...bytes));
export const fromB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

const newId = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));

// entry: { id, kind: "voice" | "operation", name, data: base64, savedAt: ISO string }
export const loadLibrary = () => store.get("library", []);
export const saveLibrary = list => store.set("library", list);
export const entry = (kind, name, bytes) => ({ id: newId(), kind, name, data: toB64(bytes), savedAt: new Date().toISOString() });
