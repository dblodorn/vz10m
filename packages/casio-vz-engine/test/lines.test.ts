import { test } from "node:test";
import assert from "node:assert/strict";
import { initVoice, setMany } from "./voices.ts";
import { Engine } from "../src/engine/engine.ts";
import { toPatch } from "../src/engine/patch.ts";
import { OUTPUT_GAIN } from "../src/engine/convert.ts";

const SR = 48000;
const MIX = 0, PHASE = 1, RING = 2;

// every module at full level and held; `on` lists the modules that play
function voice(on: number[], values: Record<string, number> = {}): Uint8Array {
  const v: Record<string, number> = {};
  for (let m = 1; m <= 8; m++) {
    Object.assign(v, { [`m${m}.off`]: on.includes(m) ? 0 : 1, [`m${m}.env1.rate`]: 127, [`m${m}.env1.level`]: 127, [`m${m}.env1.sustain`]: 1, [`m${m}.envEnd`]: 1 });
  }
  return setMany(initVoice(), { ...v, ...values });
}
function render(data: Uint8Array, note = 57, seconds = 0.2): Float32Array {
  const e = new Engine(SR);
  e.setPatch(toPatch(data));
  e.noteOn(note);
  const out = new Float32Array(Math.round(SR * seconds));
  e.render(out, out.length);
  return out;
}
const maxDiff = (a: Float32Array, b: Float32Array): number => { let d = 0; for (let i = 0; i < a.length; i++) d = Math.max(d, Math.abs(a[i]! - b[i]!)); return d; };
const peak = (a: Float32Array): number => a.reduce((p, x) => Math.max(p, Math.abs(x)), 0);
const EPS = 1e-6;

// M2 a fifth above M1, so the modules are easy to tell apart
const PAIR = { "m2.note": 7 };

test("MIX: the line is M1 + M2", () => {
  const a = render(voice([1], PAIR)), b = render(voice([2], PAIR)), both = render(voice([1, 2], PAIR));
  assert.ok(maxDiff(both, a.map((x, i) => x + b[i]!)) < EPS);
});

test("PHASE: only M2 is heard; M1 bends its phase", () => {
  const b = render(voice([2], PAIR));
  assert.equal(peak(render(voice([1], { ...PAIR, "lineA.mode": PHASE }))), 0, "M1 alone is silent");
  const pm = render(voice([1, 2], { ...PAIR, "lineA.mode": PHASE }));
  assert.ok(maxDiff(pm, b) > 0.01, "M1 changes M2");
  assert.ok(peak(pm) <= OUTPUT_GAIN + EPS, "phase modulation doesn't change M2's level");
});

test("RING: the line is M2 + M1 x M2", () => {
  const a = render(voice([1], PAIR)), b = render(voice([2], PAIR));
  const ring = render(voice([1, 2], { ...PAIR, "lineA.mode": RING }));
  // module outputs are scaled by OUTPUT_GAIN on the way out, so the product is divided by it once
  assert.ok(maxDiff(ring, b.map((y, i) => y + (a[i]! * y) / OUTPUT_GAIN)) < EPS);
  assert.equal(peak(render(voice([1], { ...PAIR, "lineA.mode": RING }))), 0, "no M2, no line");
});

test("EXT PHASE: the line it comes from is not heard (manual p.13)", () => {
  // line A alone, then line A feeding line B (whose modules are off): nothing sounds
  assert.ok(peak(render(voice([1, 2], PAIR))) > 0.05);
  assert.equal(peak(render(voice([1, 2], { ...PAIR, "m4.extPhase": 1 }))), 0);
  // with line B playing, the output stays within one module's level: line A adds nothing of its own
  assert.ok(peak(render(voice([1, 4], { "m4.note": 12, "m4.extPhase": 1 }))) <= OUTPUT_GAIN + EPS);
});

test("EXT PHASE: line A bends line B's second module", () => {
  const lineB = { "m4.note": 12 };
  const plain = render(voice([1, 4], lineB));
  const ext = render(voice([1, 4], { ...lineB, "m4.extPhase": 1 }));
  assert.ok(maxDiff(ext, plain) > 0.01, "line A changes M4");
  // with line A silent there is nothing to modulate with
  const quietA = render(voice([4], { ...lineB, "m4.extPhase": 1 }));
  assert.ok(maxDiff(quietA, render(voice([4], lineB))) < EPS);
});

test("lines are summed and each keeps its own mode", () => {
  const a = render(voice([1, 2], { ...PAIR, "lineA.mode": RING }));
  const b = render(voice([3, 4], { "m4.note": 5, "lineB.mode": PHASE }));
  const both = render(voice([1, 2, 3, 4], { ...PAIR, "m4.note": 5, "lineA.mode": RING, "lineB.mode": PHASE }));
  assert.ok(maxDiff(both, a.map((x, i) => x + b[i]!)) < EPS);
});

test("block size doesn't change the sound", () => {
  const data = voice([1, 2, 3, 4, 5, 6, 7, 8], { ...PAIR, "lineA.mode": PHASE, "lineB.mode": RING, "m6.extPhase": 1 });
  const whole = render(data, 60, 0.1);
  const e = new Engine(SR); e.setPatch(toPatch(data)); e.noteOn(60);
  const parts = new Float32Array(whole.length);
  for (let at = 0; at < parts.length; at += 37) e.render(parts, Math.min(37, parts.length - at), at);
  assert.ok(maxDiff(whole, parts) < EPS, "block size doesn't change the sound");
});
