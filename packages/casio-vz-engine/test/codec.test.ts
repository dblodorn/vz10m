import { test } from "node:test";
import assert from "node:assert/strict";
import * as pkg from "../src/index.ts";
import { checksum, fromSyx, get, getName, isVz, parse, readVoice, splitMessages, toParams, VOICE_BYTES } from "../src/index.ts";
import { initVoice, set, voiceMessage } from "./voices.ts";

test("checksum makes the 7-bit sum zero", () => {
  const data = Uint8Array.from({ length: 336 }, (_, i) => (i * 37) & 0xff);
  const sum = data.reduce((n, b) => n + b, 0) + checksum(data);
  assert.equal(sum & 0x7f, 0);
});

test("a voice message parses to its bytes, channel and type", () => {
  const v = set(initVoice("ORGAN"), "m1.env1.rate", 40);
  const p = parse(voiceMessage(v, 5));
  assert.deepEqual(p.data, v);
  assert.equal(p.channel, 5);
  assert.equal(get(p.data, "m1.env1.rate"), 40);
  assert.equal(getName(p.data), "ORGAN");
  assert.equal(toParams(p.data).values["m1.env1.rate"], 40);
});

test("a damaged dump is rejected", () => {
  const msg = voiceMessage(initVoice());
  msg[100] = msg[100]! ^ 1;
  assert.throws(() => parse(msg), /Checksum/);
});

test(".syx file: three voices, the second damaged", () => {
  const bad = voiceMessage(initVoice("TWO")); bad[50] = bad[50]! ^ 1;
  const file = new Uint8Array([...voiceMessage(initVoice("ONE")), ...bad, ...voiceMessage(initVoice("THREE"))]);
  assert.equal(splitMessages(file).length, 3);
  const { items, errors } = fromSyx(file);
  assert.deepEqual(items.map(i => [i.kind, i.name]), [["voice", "ONE"], ["voice", "THREE"]]);
  assert.deepEqual(errors.map(e => e.index), [1]);
});

test("operation messages are reported as operations", () => {
  const op = new Uint8Array(100);
  const { items } = fromSyx(voiceMessage(op));
  assert.deepEqual(items.map(i => i.kind), ["operation"]);
  assert.throws(() => readVoice(voiceMessage(op)), /operation/);
});

test("readVoice: bytes or one message, nothing else", () => {
  const v = initVoice("PAD");
  const fromBytes = readVoice(v);
  assert.deepEqual(fromBytes, v);
  assert.notEqual(fromBytes, v, "returns a copy");
  assert.deepEqual(readVoice(voiceMessage(v)), v);
  assert.throws(() => readVoice(new Uint8Array(335)), /336/);
  const bad = voiceMessage(v); bad[20] = bad[20]! ^ 1;
  assert.throws(() => readVoice(bad), /Checksum/);
});

// The package plays voices; it never changes one or builds SysEx (specs/casio-vz-engine-sdk, "Playback only").
test("no export writes to a voice or produces a SysEx message", async () => {
  for (const name of ["set", "setMany", "setName", "initVoice", "initOperation", "frame", "nibblize", "toSysex", "toSyx"]) {
    assert.ok(!(name in pkg), `${name} must not be exported`);
  }
  const voice = initVoice("KEEP");
  for (const [name, value] of Object.entries(pkg)) {
    if (typeof value !== "function") continue;
    const before = voice.slice();
    let out: unknown;
    try { out = await (value as (...a: unknown[]) => unknown)(voice, "m1.env1.rate", 5); } catch { continue; }
    assert.deepEqual(voice, before, `${name} changed the voice it was given`);
    if (out instanceof Uint8Array) assert.ok(!isVz(out), `${name} returned a SysEx message`);
    assert.equal(voice.length, VOICE_BYTES);
  }
});
