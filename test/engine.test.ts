import { test } from "node:test";
import assert from "node:assert/strict";
import { initVoice, setMany } from "../lib/vz/codec.ts";
import { Engine, VOICES } from "../lib/vz/engine/engine.ts";
import { toPatch } from "../lib/vz/engine/patch.ts";
import { OUTPUT_GAIN, rateToSpeed } from "../lib/vz/engine/convert.ts";

// one module at full level peaks at OUTPUT_GAIN
const FULL = OUTPUT_GAIN * 0.9;

const SR = 48000;
const BLOCK = 128;

// M1 only: step 1 rises fast to full level and sustains, step 2 falls to 0 and ends
const ORGAN = setMany(initVoice(), {
  "m1.env1.rate": 127, "m1.env1.level": 127, "m1.env1.sustain": 1,
  "m1.env2.rate": 90, "m1.env2.level": 0, "m1.envEnd": 1,
});

function run(engine: Engine, seconds: number): Float32Array {
  const frames = Math.round(seconds * SR);
  const out = new Float32Array(frames);
  for (let at = 0; at < frames; at += BLOCK) engine.render(out, Math.min(BLOCK, frames - at), at);
  return out;
}
const peak = (a: Float32Array, from = 0, to = a.length): number => { let p = 0; for (let i = from; i < to; i++) p = Math.max(p, Math.abs(a[i]!)); return p; };

function engineWith(voice: Uint8Array): Engine {
  const e = new Engine(SR);
  e.setPatch(toPatch(voice));
  return e;
}

test("all modules off: silence, and the voice is freed", () => {
  const e = engineWith(setMany(initVoice(), { "m1.off": 1 }));
  e.noteOn(60);
  assert.equal(peak(run(e, 0.1)), 0);
  assert.equal(e.activeVoices, 0);
});

test("sustain holds until note-off, then step 2 falls to silence", () => {
  const e = engineWith(ORGAN);
  e.noteOn(69);
  const held = run(e, 1);
  const level = peak(held, SR * 0.5);
  assert.ok(level > FULL, `held level ${level}`);
  assert.ok(Math.abs(peak(held, SR * 0.1, SR * 0.2) - level) < OUTPUT_GAIN * 0.05, "level is steady while held");
  e.noteOff(69);
  const fallSeconds = 127 / rateToSpeed(90);
  const after = run(e, fallSeconds + 0.05);
  assert.ok(peak(after, 0, BLOCK) > FULL * 0.5, "still sounding right after note-off");
  assert.equal(peak(after, after.length - BLOCK), 0, "silent once step 2 has run its course");
  assert.equal(e.isPlaying(69), false);
});

test("a note released before its sustain step goes straight on to the next step", () => {
  const slowAttack = setMany(ORGAN, { "m1.env1.rate": 20 });
  const e = engineWith(slowAttack);
  e.noteOn(60);
  run(e, 0.01);
  e.noteOff(60);
  run(e, 127 / rateToSpeed(90) + 0.05);
  assert.equal(e.isPlaying(60), false);
});

test("a finished envelope above silence fades on release", () => {
  const noSustain = setMany(ORGAN, { "m1.env1.sustain": 0, "m1.envEnd": 0 }); // ends at full level
  const e = engineWith(noSustain);
  e.noteOn(60);
  assert.ok(peak(run(e, 0.5), SR * 0.4) > FULL, "holds the end level while the key is down");
  e.noteOff(60);
  run(e, 0.05);
  assert.equal(e.isPlaying(60), false);
});

test("17 notes: the oldest is stolen", () => {
  const e = engineWith(ORGAN);
  for (let n = 0; n < VOICES + 1; n++) { e.noteOn(40 + n); run(e, 0.001); }
  assert.equal(e.activeVoices, VOICES);
  assert.equal(e.isPlaying(40), false);
  assert.equal(e.isPlaying(40 + VOICES), true);
});

test("note-off releases only that key", () => {
  const e = engineWith(ORGAN);
  e.noteOn(60); e.noteOn(64);
  e.noteOff(60);
  run(e, 1);
  assert.deepEqual([e.isPlaying(60), e.isPlaying(64)], [false, true]);
});

test("notes keep the voice they started with", () => {
  const e = engineWith(ORGAN);
  e.noteOn(60);
  e.setPatch(toPatch(setMany(ORGAN, { "m1.off": 1 })));
  assert.ok(peak(run(e, 0.2), SR * 0.1) > FULL);
});

test("rendering is deterministic", () => {
  const a = engineWith(ORGAN), b = engineWith(ORGAN);
  a.noteOn(57); b.noteOn(57);
  assert.deepEqual(run(a, 0.3), run(b, 0.3));
});

test("render allocates nothing in steady state", { skip: typeof globalThis.gc !== "function" && "run with --expose-gc" }, () => {
  const e = engineWith(ORGAN);
  for (let n = 0; n < VOICES; n++) e.noteOn(40 + n);
  const out = new Float32Array(BLOCK);
  for (let i = 0; i < 1000; i++) e.render(out, BLOCK); // warm up the JIT
  const gc = globalThis.gc as () => void;
  gc();
  const before = process.memoryUsage().heapUsed;
  for (let i = 0; i < 10000; i++) e.render(out, BLOCK);
  const grown = process.memoryUsage().heapUsed - before;
  assert.ok(grown < 256 * 1024, `heap grew ${grown} bytes over 10k blocks`);
});
