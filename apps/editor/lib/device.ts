// The device key: what makes a shared voice "yours" without an account. 32 random bytes, base64url (43
// characters), made by this browser the first time it saves and kept in localStorage. The API stores only its
// hash; whoever holds the key can rename, update and delete the voices saved with it. Copying it to another
// browser (DEVICE KEY in SHARED) moves that ownership too. Browser-only.
import { store } from "./store.ts";

const KEY = "deviceKey";
export const KEY_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export const isDeviceKey = (s: string): boolean => KEY_PATTERN.test(s);

function generate(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** The stored key, or null before the first save. */
export function readKey(): string | null {
  const k = store.get<string | null>(KEY, null);
  return typeof k === "string" && isDeviceKey(k) ? k : null;
}

/** The stored key, made and stored now if there is none. */
export function ensureKey(): string {
  const k = readKey();
  if (k) return k;
  const made = generate();
  store.set(KEY, made);
  return made;
}

/** Replace this browser's key with one copied from another. False (and nothing changed) if it isn't a key. */
export function useKey(k: string): boolean {
  const key = k.trim();
  if (!isDeviceKey(key)) return false;
  store.set(KEY, key);
  return true;
}
