import { test } from "node:test";
import assert from "node:assert/strict";
import { createRouter, type Outputs } from "../lib/play.ts";

function setup(emuReady = true) {
  const log: string[] = [];
  const out: Outputs = {
    midiOn: (c, n, v) => log.push(`midi on ${c}:${n}@${v}`),
    midiOff: (c, n) => log.push(`midi off ${c}:${n}`),
    emuOn: (n, v) => log.push(`emu on ${n}@${v}`),
    emuOff: n => log.push(`emu off ${n}`),
    emuReady: () => emuReady,
  };
  return { r: createRouter(out), log };
}

test("BOTH sends to MIDI and the emulator; VZ and EMULATOR only to one", () => {
  const { r, log } = setup();
  r.noteOn(60); r.noteOff(60);
  r.setTarget("vz"); r.noteOn(62); r.noteOff(62);
  r.setTarget("emulator"); r.noteOn(64); r.noteOff(64);
  assert.deepEqual(log, [
    "midi on 1:60@100", "emu on 60@100", "midi off 1:60", "emu off 60",
    "midi on 1:62@100", "midi off 1:62",
    "emu on 64@100", "emu off 64",
  ]);
});

test("the emulator is skipped while SOUND is off", () => {
  const { r, log } = setup(false);
  r.noteOn(60); r.noteOff(60);
  assert.deepEqual(log, ["midi on 1:60@100", "midi off 1:60"]);
});

test("two sources holding one key make one note", () => {
  const { r, log } = setup();
  r.setTarget("vz");
  r.noteOn(60); r.noteOn(60);
  r.noteOff(60);
  assert.deepEqual(log, ["midi on 1:60@100"]);
  assert.deepEqual([...r.held()], [60]);
  r.noteOff(60);
  assert.deepEqual(log, ["midi on 1:60@100", "midi off 1:60"]);
  assert.equal(r.held().size, 0);
});

test("changing PLAY TO or CHANNEL ends held notes where they were sent", () => {
  const { r, log } = setup();
  r.setTarget("vz");
  r.noteOn(60);
  r.setChannel(5);
  r.noteOn(61);
  r.setTarget("emulator");
  assert.deepEqual(log, ["midi on 1:60@100", "midi off 1:60", "midi on 5:61@100", "midi off 5:61"]);
  r.noteOff(61); // already ended: nothing more is sent
  assert.equal(log.length, 4);
});

test("velocity: the default, a per-note value, and clamping", () => {
  const { r, log } = setup();
  r.setTarget("vz");
  r.setVelocity(30); r.noteOn(60);
  r.noteOn(61, 200);
  r.setVelocity(0); r.noteOn(62);
  assert.deepEqual(log, ["midi on 1:60@30", "midi on 1:61@127", "midi on 1:62@1"]);
});

test("held-note listeners hear every change", () => {
  const { r } = setup();
  let calls = 0;
  const off = r.onHeld(() => calls++);
  r.noteOn(60); r.noteOff(60);
  off();
  r.noteOn(61);
  assert.equal(calls, 2);
});
