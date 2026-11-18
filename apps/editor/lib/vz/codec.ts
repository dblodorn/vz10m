// Voices and operations are kept as their decoded bytes (Uint8Array(336) / Uint8Array(100)): the bytes are the
// source of truth, so anything this editor doesn't model survives an edit untouched. Reading lives in
// @dblodorn/casio-vz-engine (re-exported here, so this module is the editor's whole codec); writing is here.
// Every setter returns a new array; the input is never mutated.

import { fieldOf, nameSlotOf, typeOf, VOICE_BYTES, OPERATION_BYTES } from "@dblodorn/casio-vz-engine";
import { frame, type FrameOptions } from "./sysex.ts";

export { fromSyx, get, getName, readVoice, toParams, type Kind, type SyxError, type SyxItem } from "@dblodorn/casio-vz-engine";

export function set(data: Uint8Array, key: string, value: number): Uint8Array {
  const f = fieldOf(data, key);
  const v = Math.max(f.min, Math.min(f.max, Math.round(Number(value) || 0)));
  const out = data.slice();
  out[f.byte] = (out[f.byte]! & ~f.mask) | ((v << f.shift) & f.mask);
  return out;
}

// apply many { key: value } at once
export const setMany = (data: Uint8Array, values: Record<string, number>): Uint8Array =>
  Object.entries(values).reduce((d, [k, v]) => set(d, k, v), data);

export function setName(data: Uint8Array, name: string): Uint8Array {
  const { offset, length } = nameSlotOf(data);
  const out = data.slice();
  const text = String(name).toUpperCase().replace(/[^\x20-\x7e]/g, " ").padEnd(length, " ").slice(0, length);
  for (let i = 0; i < length; i++) out[offset + i] = text.charCodeAt(i);
  return out;
}

export const toSysex = (data: Uint8Array, opts?: FrameOptions): Uint8Array => frame(typeOf(data), data, opts);

export function toSyx(list: Uint8Array[], opts?: FrameOptions): Uint8Array {
  const msgs = list.map(d => toSysex(d, opts));
  const out = new Uint8Array(msgs.reduce((n, m) => n + m.length, 0));
  let at = 0;
  for (const m of msgs) { out.set(m, at); at += m.length; }
  return out;
}

// ---------- fresh data ----------

// A playable starting voice: M1 sine on, the other seven modules off, a simple organ-style envelope, everything
// else neutral (full ENV DEPTH and KF levels, no pitch envelope). The values are chosen by this editor, not taken
// from a VZ factory "initial voice". ENV DEPTH, KF LEVEL (DCA) and TOTAL LEVEL are stored inverted: 0 is full.
export function initVoice(name = "INIT VOICE"): Uint8Array {
  let d: Uint8Array = new Uint8Array(VOICE_BYTES);
  for (let m = 1; m <= 8; m++) {
    d = set(d, `m${m}.off`, m === 1 ? 0 : 1);
    d = set(d, `m${m}.envDepth`, 0);
    d = set(d, `m${m}.envEnd`, 2);
    d = set(d, `m${m}.env1.rate`, 99);
    d = set(d, `m${m}.env1.level`, 127); // stored levels are 0-127 (full scale), not the panel's 0-99
    d = set(d, `m${m}.env1.sustain`, 1);
    d = set(d, `m${m}.env2.rate`, 60);
    d = set(d, `m${m}.env2.level`, 0);
    d = set(d, `m${m}.detunePlus`, 1);
  }
  for (let s = 1; s <= 6; s++) {
    d = set(d, `dco.kf${s}.key`, 12 + (s - 1) * 21);
    d = set(d, `dco.kf${s}.level`, 63); // full pitch envelope at every key
    d = set(d, `rate.kf${s}.key`, 12 + (s - 1) * 21);
    for (let m = 1; m <= 8; m++) {
      d = set(d, `m${m}.kf${s}.key`, 12 + (s - 1) * 21);
      d = set(d, `m${m}.kf${s}.level`, 0);
    }
  }
  for (let s = 1; s <= 8; s++) d = set(d, `dco.env${s}.level`, 64); // 64 = no pitch change
  d = set(d, "dco.envEnd", 7);
  d = set(d, "level", 0);
  return setName(d, name);
}

export const initOperation = (name = "INIT OP"): Uint8Array => setName(new Uint8Array(OPERATION_BYTES), name);
