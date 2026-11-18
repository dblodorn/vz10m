import { test } from "node:test";
import assert from "node:assert/strict";
import { initVoice, setMany } from "./voices.ts";
import { Engine } from "../src/engine/engine.ts";
import { toPatch } from "../src/engine/patch.ts";
import { invertedToGain, levelToGain, noteToHz, OUTPUT_GAIN, rateToSpeed } from "../src/engine/convert.ts";

const SR = 48000;
// M1 alone, full level, held; fast attack so steady state comes quickly
const BASE = setMany(initVoice(), { "m1.env1.rate": 127, "m1.env1.level": 127, "m1.env1.sustain": 1, "m1.envEnd": 1 });

function render(values: Record<string, number>, note = 69, seconds = 0.5, velocity = 100): Float32Array {
  const e = new Engine(SR);
  e.setPatch(toPatch(setMany(BASE, values)));
  e.noteOn(note, velocity);
  const out = new Float32Array(Math.round(SR * seconds));
  e.render(out, out.length);
  return out;
}
const peak = (a: Float32Array, from = 0.2, to = a.length / SR): number => {
  let p = 0;
  for (let i = Math.round(from * SR); i < Math.round(to * SR); i++) p = Math.max(p, Math.abs(a[i]!));
  return p;
};
const near = (got: number, want: number, tol = 0.01) =>
  assert.ok(Math.abs(got - want) <= tol * Math.max(want, 1e-9) + 1e-6, `${got} vs ${want}`);
// frequency from upward zero crossings between two times
function frequency(a: Float32Array, from: number, to: number): number {
  let first = -1, last = -1, count = 0;
  for (let i = Math.round(from * SR) + 1; i < Math.round(to * SR); i++) {
    if (a[i - 1]! < 0 && a[i]! >= 0) { const t = i - 1 + a[i - 1]! / (a[i - 1]! - a[i]!); if (first < 0) first = t; else count++; last = t; }
  }
  return (count * SR) / (last - first);
}
const cents = (got: number, want: number) => 1200 * Math.log2(got / want);

test("TOTAL LEVEL scales the voice; stored inverted, 127 is silent", () => {
  near(peak(render({ level: 0 })), OUTPUT_GAIN);
  near(peak(render({ level: 40 })), OUTPUT_GAIN * invertedToGain(40));
  assert.equal(peak(render({ level: 127 })), 0);
});

test("ENV DEPTH (DCA) scales its module; stored inverted", () => {
  near(peak(render({ "m1.envDepth": 30 })), OUTPUT_GAIN * invertedToGain(30));
});

test("KF LEVEL (DCA) lowers the module by key, interpolated between points", () => {
  // full at C2 (36), stored 60 at C6 (84): A4 (69) is 33/48 of the way
  const kf = { "m1.kf1.key": 36, "m1.kf2.key": 84, "m1.kf3.key": 96, "m1.kf4.key": 100, "m1.kf5.key": 110, "m1.kf6.key": 120,
    "m1.kf1.level": 0, "m1.kf2.level": 60, "m1.kf3.level": 60, "m1.kf4.level": 60, "m1.kf5.level": 60, "m1.kf6.level": 60 };
  near(peak(render(kf, 36)), OUTPUT_GAIN);
  near(peak(render(kf, 69)), OUTPUT_GAIN * invertedToGain((60 * 33) / 48));
  near(peak(render(kf, 100)), OUTPUT_GAIN * invertedToGain(60));
});

test("VELOCITY LEVEL (DCA): SENS 0 ignores velocity; SENS 31 on the linear curve follows it", () => {
  near(peak(render({}, 69, 0.5, 20)), OUTPUT_GAIN);
  const linear = { "m1.velCurve": 2, "m1.velSens": 31 };
  near(peak(render(linear, 69, 0.5, 127)), OUTPUT_GAIN);
  near(peak(render(linear, 69, 0.5, 64)), OUTPUT_GAIN * levelToGain(127 * (64 / 127)));
});

test("pitch envelope: 12 units up is an octave on WIDE, 300 cents on NARROW (manual p.37)", () => {
  const up = { "dco.env1.rate": 127, "dco.env1.level": 64 + 12, "dco.env1.sustain": 1, "dco.envDepth": 63 };
  near(frequency(render({ ...up, "dco.range": 1 }), 0.1, 0.5), noteToHz(81), 0.002);
  assert.ok(Math.abs(cents(frequency(render(up), 0.1, 0.5), noteToHz(69)) - 300) < 2);
});

test("pitch envelope depth and KF LEVEL (DCO) scale it; 0 is no change", () => {
  const up = { "dco.env1.rate": 127, "dco.env1.level": 64 + 12, "dco.env1.sustain": 1, "dco.range": 1 };
  near(frequency(render({ ...up, "dco.envDepth": 0 }), 0.1, 0.5), noteToHz(69), 0.002);
  const noKf = Object.fromEntries([1, 2, 3, 4, 5, 6].map(s => [`dco.kf${s}.level`, 0]));
  near(frequency(render({ ...up, "dco.envDepth": 63, ...noKf }), 0.1, 0.5), noteToHz(69), 0.002);
});

// time for M1 to reach half its sustain level after note-on
function attack(values: Record<string, number>, note = 69, velocity = 100): number {
  const a = render({ "m1.env1.rate": 60, ...values }, note, 2, velocity);
  const target = OUTPUT_GAIN * levelToGain(63.5);
  for (let i = 0; i < a.length; i += 48) if (peak(a, i / SR, (i + 480) / SR) >= target) return i / SR;
  return Infinity;
}

test("KF RATE speeds envelopes where it is higher", () => {
  const kf = Object.fromEntries([1, 2, 3, 4, 5, 6].flatMap(s => [[`rate.kf${s}.key`, 24 + s * 16], [`rate.kf${s}.rate`, 40]]));
  const plain = attack({}), fast = attack(kf);
  assert.ok(fast < plain * 0.5, `attack ${fast}s with KF RATE vs ${plain}s without`);
  near(plain, 63.5 / rateToSpeed(60), 0.1);
});

test("VELOCITY RATE: only on marked steps, faster with harder playing", () => {
  const vr = { "rate.velCurve": 2, "rate.velSens": 31 };
  near(attack({ ...vr }, 69, 127), attack({}), 0.05); // step not marked
  const marked = { ...vr, "m1.env1.velRate": 1 };
  assert.ok(attack(marked, 69, 127) < attack(marked, 69, 20) * 0.5);
});

test("vibrato moves the pitch after its delay", () => {
  const vib = { "vib.depth": 127, "vib.rate": 60, "vib.delay": 30, "vib.wave": 3 }; // square: note, then up
  const a = render(vib, 69, 2.5);
  const delay = (30 / 127) * 5;
  near(frequency(a, 0.05, delay - 0.05), noteToHz(69), 0.002);
  // after the delay the square alternates between the note and 100 cents above it
  let lo = Infinity, hi = 0;
  for (let t = delay + 0.1; t < 2.4; t += 0.02) { const f = frequency(a, t, t + 0.02); lo = Math.min(lo, f); hi = Math.max(hi, f); }
  assert.ok(cents(lo, noteToHz(69)) < 10 && cents(hi, noteToHz(69)) > 80, `range ${lo}..${hi}`);
});

test("tremolo lowers the level by AMP SENS; 0 leaves it alone", () => {
  const trem = { "trem.depth": 127, "trem.rate": 80, "trem.wave": 3 };
  const quietest = (a: Float32Array) => { let q = Infinity; for (let t = 0.1; t < 1.4; t += 0.01) q = Math.min(q, peak(a, t, t + 0.01)); return q; };
  near(quietest(render({ ...trem, "m1.ampSens": 0 }, 69, 1.5)), OUTPUT_GAIN);
  assert.ok(quietest(render({ ...trem, "m1.ampSens": 7 }, 69, 1.5)) < OUTPUT_GAIN * 0.05);
  const half = quietest(render({ ...trem, "m1.ampSens": 7, "trem.depth": 64 }, 69, 1.5));
  near(half, OUTPUT_GAIN * (1 - 64 / 127), 0.05);
});

test("render with every modulation running allocates nothing", { skip: typeof globalThis.gc !== "function" && "run with --expose-gc" }, () => {
  const e = new Engine(SR);
  e.setPatch(toPatch(setMany(BASE, {
    "vib.depth": 80, "vib.rate": 60, "vib.multi": 1, "trem.depth": 80, "trem.rate": 50, "m1.ampSens": 5,
    "dco.envDepth": 40, "dco.env1.level": 70, "dco.env1.rate": 30,
  })));
  for (let n = 0; n < 16; n++) e.noteOn(40 + n, 30 + n * 5);
  const out = new Float32Array(128);
  for (let i = 0; i < 1000; i++) e.render(out, 128);
  const gc = globalThis.gc as () => void;
  gc();
  const before = process.memoryUsage().heapUsed;
  for (let i = 0; i < 10000; i++) e.render(out, 128);
  assert.ok(process.memoryUsage().heapUsed - before < 256 * 1024);
});
