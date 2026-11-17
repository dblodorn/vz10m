// The iPD engine: a pool of 16 voices x 8 modules, rendered sample by sample into a mono buffer.
// Runs unchanged in Node (tests, scripts/render.ts) and in the AudioWorklet (worklet/vz-processor.ts).
// render() allocates nothing: all state is in typed arrays sized here.
//
// Step 1 of openspec/changes/vz10m-emulator: every module that is on plays a sine at the note's pitch through
// its DCA envelope, and the modules are mixed. Waves, detune, lines and modulation come in later steps.

import { LEVEL_MAX, levelToGain, noteToHz, OUTPUT_GAIN } from "./convert.ts";
import { MODULES, type Patch } from "./patch.ts";

export const VOICES = 16; // VZ-10M owner's manual p.5: "total 16-note MIDI polyphony"

const SINE_SIZE = 4096;
const SINE = new Float64Array(SINE_SIZE + 1);
for (let i = 0; i <= SINE_SIZE; i++) SINE[i] = Math.sin((2 * Math.PI * i) / SINE_SIZE);

// level (0-127, fractional) -> gain, by table: levelToGain is too slow per sample
const GAIN_STEPS = 32;
const GAIN = new Float64Array(LEVEL_MAX * GAIN_STEPS + 2);
for (let i = 0; i < GAIN.length; i++) GAIN[i] = levelToGain(i / GAIN_STEPS);

// when a released note's envelope has already finished above silence, fade it out over this long
const RELEASE_FADE_S = 0.01;

const DONE = -1; // step value once an envelope has finished

export class Engine {
  readonly sampleRate: number;
  private patch: Patch | null = null;

  private readonly voicePatch: (Patch | null)[] = new Array(VOICES).fill(null);
  private readonly note = new Int16Array(VOICES).fill(-1); // -1: free
  private readonly gate = new Uint8Array(VOICES);
  private readonly started = new Float64Array(VOICES); // note-on order, for stealing
  private counter = 0;

  // per voice x module
  private readonly phase = new Float64Array(VOICES * MODULES);
  private readonly inc = new Float64Array(VOICES * MODULES);
  private readonly level = new Float64Array(VOICES * MODULES); // envelope level, 0-127
  private readonly step = new Int8Array(VOICES * MODULES); // current step, or DONE

  private readonly fadePerSample: number;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
    this.fadePerSample = LEVEL_MAX / (RELEASE_FADE_S * sampleRate);
  }

  setPatch(patch: Patch): void { this.patch = patch; }

  isPlaying(note: number): boolean { for (let v = 0; v < VOICES; v++) if (this.note[v] === note) return true; return false; }

  get activeVoices(): number { let n = 0; for (let v = 0; v < VOICES; v++) if (this.note[v]! >= 0) n++; return n; }

  noteOn(note: number, velocity = 100): void {
    void velocity; // velocity curves arrive in step 4
    const patch = this.patch;
    if (!patch) return;
    const v = this.pickVoice(note);
    this.note[v] = note;
    this.gate[v] = 1;
    this.started[v] = ++this.counter;
    this.voicePatch[v] = patch;
    const hz = noteToHz(note);
    for (let m = 0; m < MODULES; m++) {
      const i = v * MODULES + m;
      this.phase[i] = 0;
      this.inc[i] = hz / this.sampleRate;
      this.level[i] = 0;
      this.step[i] = patch.modules[m]!.on ? 0 : DONE;
    }
  }

  noteOff(note: number): void {
    for (let v = 0; v < VOICES; v++) {
      if (this.note[v] !== note || !this.gate[v]) continue;
      this.gate[v] = 0;
      const patch = this.voicePatch[v]!;
      for (let m = 0; m < MODULES; m++) {
        const i = v * MODULES + m, env = patch.modules[m]!.env;
        // before or at the sustain step: go on from the step after it
        if (env.sustain >= 0 && this.step[i]! !== DONE && this.step[i]! <= env.sustain) {
          this.step[i] = env.sustain + 1 <= env.end ? env.sustain + 1 : DONE;
        }
      }
    }
  }

  allOff(): void {
    this.note.fill(-1);
    this.gate.fill(0);
    this.voicePatch.fill(null);
  }

  // a free voice, the voice already playing this key, or the oldest
  private pickVoice(note: number): number {
    let oldest = 0;
    for (let v = 0; v < VOICES; v++) {
      if (this.note[v] === note) return v;
      if (this.started[v]! < this.started[oldest]!) oldest = v;
    }
    for (let v = 0; v < VOICES; v++) if (this.note[v]! < 0) return v;
    return oldest;
  }

  // Adds `frames` samples into out[offset...]; out is not cleared first.
  render(out: Float32Array, frames: number, offset = 0): void {
    const sr = this.sampleRate;
    for (let v = 0; v < VOICES; v++) {
      if (this.note[v]! < 0) continue;
      const patch = this.voicePatch[v]!;
      const gate = this.gate[v]!;
      let alive = false;
      for (let m = 0; m < MODULES; m++) {
        const i = v * MODULES + m;
        const mod = patch.modules[m]!;
        if (!mod.on) continue;
        const env = mod.env;
        let phase = this.phase[i]!, level = this.level[i]!, step = this.step[i]!;
        const inc = this.inc[i]!;
        for (let n = 0; n < frames; n++) {
          // envelope: move toward this step's level at its rate; advance when it gets there
          if (step !== DONE) {
            const target = env.level[step]!, d = env.speed[step]! / sr;
            if (level < target) level = Math.min(target, level + d);
            else if (level > target) level = Math.max(target, level - d);
            if (level === target && !(gate && step === env.sustain)) step = step >= env.end ? DONE : step + 1;
          } else if (!gate && level > 0) {
            level = Math.max(0, level - this.fadePerSample);
          }
          // sine by table, linear interpolation
          const x = phase * SINE_SIZE, k = x | 0, f = x - k;
          const s = SINE[k]! + (SINE[k + 1]! - SINE[k]!) * f;
          const g = GAIN[(level * GAIN_STEPS) | 0]!;
          out[offset + n] = out[offset + n]! + s * g * OUTPUT_GAIN;
          phase += inc;
          if (phase >= 1) phase -= 1;
        }
        this.phase[i] = phase; this.level[i] = level; this.step[i] = step;
        if (step !== DONE || level > 0 || gate) alive = true;
      }
      if (!alive) { this.note[v] = -1; this.voicePatch[v] = null; }
    }
  }
}
