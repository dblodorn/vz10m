import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { checksum, frame, parse, splitMessages, nibblize, denibblize, TYPE, messageLength } from "../lib/vz/sysex.ts";
import { get, set, getName, setName, toParams, toSysex, fromSyx, toSyx, initVoice, initOperation } from "../lib/vz/codec.ts";
import { VOICE_FIELDS, OPERATION_FIELDS } from "@dblodorn/casio-vz-engine";

const FIXTURES = new URL("../fixtures/", import.meta.url).pathname;

test("nibbles round trip", () => {
  const data = Uint8Array.from({ length: 256 }, (_, i) => i);
  assert.deepEqual(denibblize(nibblize(data)), data);
});

test("checksum makes the 7-bit sum zero", () => {
  const data = Uint8Array.from({ length: 336 }, (_, i) => (i * 37) & 0xff);
  const sum = data.reduce((n, b) => n + b, 0) + checksum(data);
  assert.equal(sum & 0x7f, 0);
});

test("voice framing: length, header, channel", () => {
  const msg = frame(TYPE.VOICE, initVoice(), { channel: 5 });
  assert.equal(msg.length, 681);
  assert.equal(msg.length, messageLength(336));
  assert.deepEqual([...msg.slice(0, 7)], [0xf0, 0x44, 0x03, 0x00, 0x74, 0x00, 0x40]);
  assert.equal(msg.at(-1), 0xf7);
  const p = parse(msg);
  assert.equal(p.channel, 5);
  assert.equal(p.type, TYPE.VOICE);
});

test("operation framing is 209 bytes", () => {
  assert.equal(toSysex(initOperation()).length, 209);
});

test("a damaged dump is rejected", () => {
  const msg = toSysex(initVoice());
  msg[100] = msg[100]! ^ 1;
  assert.throws(() => parse(msg), /Checksum/);
});

test("every voice field writes only its own bits", () => {
  const base = Uint8Array.from({ length: 336 }, (_, i) => (i * 101 + 7) & 0xff);
  for (const f of VOICE_FIELDS) {
    const v = f.max === f.min ? f.min : f.min + 1;
    const out = set(base, f.key, v);
    assert.equal(get(out, f.key), v, f.key);
    for (let i = 0; i < 336; i++) {
      const allowed = i === f.byte ? f.mask : 0;
      assert.equal(out[i]! & ~allowed & 0xff, base[i]! & ~allowed & 0xff, `${f.key} touched byte ${i}`);
    }
  }
});

test("every operation field writes only its own bits", () => {
  const base = Uint8Array.from({ length: 100 }, (_, i) => (i * 53 + 3) & 0xff);
  for (const f of OPERATION_FIELDS) {
    const out = set(base, f.key, f.max);
    assert.equal(get(out, f.key), f.max, f.key);
    for (let i = 0; i < 100; i++) if (i !== f.byte) assert.equal(out[i], base[i], `${f.key} touched byte ${i}`);
  }
});

test("set clamps to the field's range and leaves the input alone", () => {
  const v = initVoice();
  const before = v.slice();
  assert.equal(get(set(v, "m1.wave", 99), "m1.wave"), 7);
  assert.equal(get(set(v, "lineA.mode", 3), "lineA.mode"), 2);
  assert.deepEqual(v, before);
});

test("names", () => {
  const v = setName(initVoice(), "brass pad");
  assert.equal(getName(v), "BRASS PAD");
  assert.equal(getName(setName(v, "A NAME LONGER THAN TWELVE")), "A NAME LONGE");
  assert.equal(toParams(v).name, "BRASS PAD");
});

test(".syx files: several messages, one bad", () => {
  const a = setName(initVoice(), "ONE"), b = setName(initOperation(), "TWO");
  const bytes = toSyx([a, b]);
  const bad = toSysex(initVoice()); bad[50] = bad[50]! ^ 1;
  const file = new Uint8Array([...bytes, ...bad]);
  assert.equal(splitMessages(file).length, 3);
  const { items, errors } = fromSyx(file);
  assert.deepEqual(items.map(i => [i.kind, i.name]), [["voice", "ONE"], ["operation", "TWO"]]);
  assert.equal(errors.length, 1);
});

// Golden data: every dump captured from a VZ-10M into fixtures/ must parse and re-encode byte for byte.
const fixtures = (() => { try { return readdirSync(FIXTURES).filter(f => f.toLowerCase().endsWith(".syx")); } catch { return []; } })();
for (const name of fixtures) {
  test(`fixture ${name} round trips`, () => {
    const bytes = new Uint8Array(readFileSync(join(FIXTURES, name)));
    const msgs = splitMessages(bytes);
    assert.ok(msgs.length > 0, "no SysEx messages in file");
    for (const msg of msgs) {
      const p = parse(msg);
      assert.deepEqual(frame(p.type, p.data, { channel: p.channel, area: p.area }), msg);
    }
  });
}
