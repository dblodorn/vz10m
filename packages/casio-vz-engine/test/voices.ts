// Test fixtures only, not exported by the package: a way to build voices for the engine tests, which the
// package itself deliberately can't do. `set` and `initVoice` are copies of the editor's
// (apps/editor/lib/vz/codec.ts); the tests depend on these values, not on the editor's.

import { fieldOf } from "../src/codec.ts";
import { VOICE_BYTES } from "../src/sysex.ts";

export function set(data: Uint8Array, key: string, value: number): Uint8Array {
  const f = fieldOf(data, key);
  const v = Math.max(f.min, Math.min(f.max, Math.round(Number(value) || 0)));
  const out = data.slice();
  out[f.byte] = (out[f.byte]! & ~f.mask) | ((v << f.shift) & f.mask);
  return out;
}

export const setMany = (data: Uint8Array, values: Record<string, number>): Uint8Array =>
  Object.entries(values).reduce((d, [k, v]) => set(d, k, v), data);

// M1 sine on, the other modules off, an organ envelope, everything else neutral (the editor's INIT VOICE)
export function initVoice(name = "INIT VOICE"): Uint8Array {
  let d: Uint8Array = new Uint8Array(VOICE_BYTES);
  for (let m = 1; m <= 8; m++) {
    d = set(d, `m${m}.off`, m === 1 ? 0 : 1);
    d = set(d, `m${m}.envDepth`, 0);
    d = set(d, `m${m}.envEnd`, 2);
    d = set(d, `m${m}.env1.rate`, 99);
    d = set(d, `m${m}.env1.level`, 127);
    d = set(d, `m${m}.env1.sustain`, 1);
    d = set(d, `m${m}.env2.rate`, 60);
    d = set(d, `m${m}.env2.level`, 0);
    d = set(d, `m${m}.detunePlus`, 1);
  }
  for (let s = 1; s <= 6; s++) {
    d = set(d, `dco.kf${s}.key`, 12 + (s - 1) * 21);
    d = set(d, `dco.kf${s}.level`, 63);
    d = set(d, `rate.kf${s}.key`, 12 + (s - 1) * 21);
    for (let m = 1; m <= 8; m++) {
      d = set(d, `m${m}.kf${s}.key`, 12 + (s - 1) * 21);
      d = set(d, `m${m}.kf${s}.level`, 0);
    }
  }
  for (let s = 1; s <= 8; s++) d = set(d, `dco.env${s}.level`, 64);
  d = set(d, "dco.envEnd", 7);
  d = set(d, "level", 0);
  const out = d.slice();
  const text = name.padEnd(12, " ").slice(0, 12);
  for (let i = 0; i < 12; i++) out[322 + i] = text.charCodeAt(i); // VOICE_NAME: offset 322, 12 characters
  return out;
}

// One voice SysEx message (the editor's frame(), for parsing tests).
export function voiceMessage(data: Uint8Array, channel = 1): Uint8Array {
  const msg = new Uint8Array(7 + data.length * 2 + 2);
  msg.set([0xf0, 0x44, 0x03, 0x00, 0x70 | (channel - 1), data.length === VOICE_BYTES ? 0x00 : 0x01, 0x40]);
  data.forEach((b, i) => { msg[7 + i * 2] = b >> 4; msg[8 + i * 2] = b & 0x0f; });
  let sum = 0;
  for (const b of data) sum += b;
  msg[msg.length - 2] = -sum & 0x7f;
  msg[msg.length - 1] = 0xf7;
  return msg;
}
