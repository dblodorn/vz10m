// The eight DCO waveforms. All functions are allocation-free and take the phase in cycles (0-1).
// Shapes come from convert.ts (ESTIMATES until measured against the hardware).

import { NOISE2_TONE, PD_MIN_SAMPLES, SAW_BREAKPOINTS } from "./convert.ts";

export const SINE = 0, NOISE1 = 6, NOISE2 = 7;

const SIZE = 4096;
const TABLE = new Float64Array(SIZE + 1);
for (let i = 0; i <= SIZE; i++) TABLE[i] = Math.sin((2 * Math.PI * i) / SIZE);

// sine by table, linear interpolation; phase in [0, 1)
export function sine(phase: number): number {
  const x = phase * SIZE, k = x | 0;
  return TABLE[k]! + (TABLE[k + 1]! - TABLE[k]!) * (x - k);
}

// Phase distortion: the first half of the sine is read in `d` of the period, the second half in the rest.
// d = 0.5 is a plain sine; smaller d is brighter.
export function pd(phase: number, d: number): number {
  return sine(phase < d ? phase * (0.5 / d) : 0.5 + (phase - d) * (0.5 / (1 - d)));
}

// xorshift32 white noise in [-1, 1). One generator per engine, seeded the same every time, so renders repeat.
export class Noise {
  private state = 0x9e3779b9;
  next(): number {
    let x = this.state;
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    this.state = x >>> 0;
    return this.state / 0x80000000 - 1;
  }
}

// One sample of wave `w` (0 SINE, 1-5 SAW1-5, 6 NOISE1, 7 NOISE2). `inc` is the phase step per sample, used to
// keep SAW's bend at least PD_MIN_SAMPLES long so high notes don't alias.
export function oscillator(w: number, phase: number, inc: number, noise: Noise): number {
  if (w === SINE) return sine(phase);
  if (w === NOISE1) return noise.next();
  if (w === NOISE2) return NOISE2_TONE * sine(phase) + (1 - NOISE2_TONE) * noise.next();
  const d = Math.min(0.5, Math.max(SAW_BREAKPOINTS[w - 1] ?? 0.5, inc * PD_MIN_SAMPLES));
  return pd(phase, d);
}
