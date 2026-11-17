import { test } from "node:test";
import assert from "node:assert/strict";
import { initVoice, setMany } from "../lib/vz/codec.ts";
import { Engine } from "../lib/vz/engine/engine.ts";
import { toPatch } from "../lib/vz/engine/patch.ts";
import { CENTS_PER_FINE, fixedHz, noteToHz } from "../lib/vz/engine/convert.ts";
import { oscillator, Noise } from "../lib/vz/engine/waves.ts";

const SR = 48000;
// M1 alone, at full level and held
const BASE = setMany(initVoice(), { "m1.env1.rate": 127, "m1.env1.level": 127, "m1.env1.sustain": 1, "m1.envEnd": 1 });

function render(values: Record<string, number>, note: number, seconds = 1): Float32Array {
  const e = new Engine(SR);
  e.setPatch(toPatch(setMany(BASE, values)));
  e.noteOn(note);
  const out = new Float32Array(SR * seconds);
  for (let at = 0; at < out.length; at += 128) e.render(out, Math.min(128, out.length - at), at);
  return out;
}

// frequency from upward zero crossings, skipping the attack; every wave here crosses up once per cycle
function frequency(a: Float32Array): number {
  const from = SR * 0.1;
  let first = -1, last = -1, count = 0;
  for (let i = from + 1; i < a.length; i++) {
    if (a[i - 1]! < 0 && a[i]! >= 0) {
      const t = i - 1 + a[i - 1]! / (a[i - 1]! - a[i]!); // interpolated crossing
      if (first < 0) first = t; else count++;
      last = t;
    }
  }
  return (count * SR) / (last - first);
}
const close = (got: number, want: number, cents = 2) => {
  const off = 1200 * Math.log2(got / want);
  assert.ok(Math.abs(off) < cents, `${got.toFixed(2)} Hz is ${off.toFixed(2)} cents from ${want.toFixed(2)} Hz`);
};

test("a module follows the key, A4 = 442 Hz (manual p.41)", () => close(frequency(render({}, 69)), 442));

test("DETUNE NOTE shifts by semitones, both ways", () => {
  close(frequency(render({ "m1.note": 12 }, 57)), noteToHz(69));
  close(frequency(render({ "m1.note": 7, "m1.detunePlus": 0 }, 76)), noteToHz(69));
});

test("DETUNE FINE adds fractions of a semitone", () => {
  close(frequency(render({ "m1.fine": 32 }, 69)), noteToHz(69) * Math.pow(2, (32 * CENTS_PER_FINE) / 1200));
});

test("OCTAVE moves key-following modules by octaves", () => {
  close(frequency(render({ octave: 1, octavePlus: 1 }, 57)), noteToHz(69));
  close(frequency(render({ octave: 2, octavePlus: 0 }, 69)), noteToHz(45));
});

test("PITCH FIX ignores the key, from F#-1; x1/16 drops it 4 octaves (manual p.35)", () => {
  close(frequency(render({ "m1.fix": 1 }, 60)), noteToHz(6)); // OCT, NOTE, FINE 0: F#-1
  const fixed = { "m1.fix": 1, "m1.note": 39 }; // F#-1 + 39 semitones = A2
  close(frequency(render(fixed, 30)), noteToHz(45));
  close(frequency(render(fixed, 90)), noteToHz(45));
  assert.equal(fixedHz(39, 0, false), noteToHz(45));
  close(frequency(render({ "m1.fix": 1, "m1.note": 71, "m1.fixRange": 1 }, 60)), noteToHz(77) / 16);
});

test("every wave stays in range and is audible", () => {
  for (let w = 0; w < 8; w++) {
    const a = render({ "m1.wave": w }, 60, 0.3);
    let peak = 0;
    for (const x of a) peak = Math.max(peak, Math.abs(x));
    assert.ok(peak > 0.05 && peak <= 0.1 + 1e-6, `wave ${w} peak ${peak}`);
  }
});

// brightness: mean square of the first difference relative to the signal's own power
function brightness(w: number): number {
  const noise = new Noise(), inc = 110 / SR;
  let d = 0, p = 0, prev = 0, phase = 0;
  for (let i = 0; i < SR; i++) {
    const s = oscillator(w, phase, inc, noise);
    d += (s - prev) ** 2; p += s * s; prev = s;
    phase += inc; if (phase >= 1) phase -= 1;
  }
  return d / p;
}

test("SINE < SAW1 < ... < SAW5 in brightness", () => {
  const b = [0, 1, 2, 3, 4, 5].map(brightness);
  for (let i = 1; i < b.length; i++) assert.ok(b[i]! > b[i - 1]!, `wave ${i} (${b[i]}) not brighter than wave ${i - 1} (${b[i - 1]})`);
});

test("SAW5 softens at high notes instead of aliasing", () => {
  // near the top, the bend is held to at least 2 samples, so no single-sample jumps of the full range
  const noise = new Noise(), inc = 8000 / SR;
  let phase = 0, prev = oscillator(5, 0, inc, noise), jump = 0;
  for (let i = 0; i < 4800; i++) {
    phase += inc; if (phase >= 1) phase -= 1;
    const s = oscillator(5, phase, inc, noise);
    jump = Math.max(jump, Math.abs(s - prev)); prev = s;
  }
  assert.ok(jump < 1.5, `largest step ${jump}`);
});

test("noise is the same on every render", () => {
  assert.deepEqual(render({ "m1.wave": 6 }, 60, 0.1), render({ "m1.wave": 6 }, 60, 0.1));
});
