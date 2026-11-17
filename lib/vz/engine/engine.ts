// The iPD engine: a pool of 16 voices x 8 modules, rendered in blocks into a mono buffer.
// Runs unchanged in Node (tests, scripts/render.ts) and in the AudioWorklet (worklet/vz-processor.ts).
// render() allocates nothing: all state is in typed arrays sized here.
//
// Steps 1-3 of openspec/changes/vz10m-emulator. Every module that is on plays its waveform at its own pitch
// (the key plus OCTAVE and DETUNE, or a fixed frequency) through its DCA envelope. Modules pair into lines
// A-D (M1+M2 ... M7+M8). The second module always feeds the line:
//   MIX    M1 + M2
//   PHASE  M2 with M1 added to its phase
//   RING   M2 + M1 x M2
// With EXT PHASE, the previous line's output is also added to the second module's phase (lines B-D).
// The four lines are summed. Pitch envelope, key follow and the LFOs come in step 4.

import { EXT_PHASE_DEPTH, LEVEL_MAX, levelToGain, noteToHz, OUTPUT_GAIN, PHASE_MOD_DEPTH } from "./convert.ts";
import { LINES, MODULES, PHASE, RING, type Patch } from "./patch.ts";
import { Noise, oscillator } from "./waves.ts";

export const VOICES = 16; // VZ-10M owner's manual p.5: "total 16-note MIDI polyphony"

// level (0-127, fractional) -> gain, by table: levelToGain is too slow per sample
const GAIN_STEPS = 32;
const GAIN = new Float64Array(LEVEL_MAX * GAIN_STEPS + 2);
for (let i = 0; i < GAIN.length; i++) GAIN[i] = levelToGain(i / GAIN_STEPS);

// a phase step above half a cycle per sample would alias; pitches that high are clamped to it
const NYQUIST = 0.5;

// when a released note's envelope has already finished above silence, fade it out over this long
const RELEASE_FADE_S = 0.01;

const DONE = -1; // step value once an envelope has finished

// render() works in blocks of at most this many frames, through scratch buffers of this size
const BLOCK = 128;

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
  private readonly noise = new Noise();

  // scratch, one block long: each line's two module outputs, phase offsets, and this and the previous line
  private readonly first = new Float64Array(BLOCK);
  private readonly second = new Float64Array(BLOCK);
  private readonly offsets = new Float64Array(BLOCK);
  private lineOut = new Float64Array(BLOCK);
  private prevLine = new Float64Array(BLOCK);

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
    for (let m = 0; m < MODULES; m++) {
      const i = v * MODULES + m, mod = patch.modules[m]!;
      const hz = mod.fixedHz > 0 ? mod.fixedHz : noteToHz(note + patch.octave + mod.detune);
      this.phase[i] = 0;
      this.inc[i] = Math.min(hz / this.sampleRate, NYQUIST);
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
    for (let at = 0; at < frames; at += BLOCK) this.renderBlock(out, Math.min(BLOCK, frames - at), offset + at);
  }

  private renderBlock(out: Float32Array, frames: number, offset: number): void {
    const { first, second, offsets } = this;
    for (let v = 0; v < VOICES; v++) {
      if (this.note[v]! < 0) continue;
      const patch = this.voicePatch[v]!;
      let alive = false;
      this.prevLine.fill(0, 0, frames);
      for (let l = 0; l < LINES; l++) {
        const mode = patch.lineMode[l]!;
        // first module: unmodulated
        offsets.fill(0, 0, frames);
        alive = this.runModule(v, l * 2, frames, offsets, first) || alive;
        // second module: M1 in its phase (PHASE), and the previous line (EXT PHASE)
        const ext = patch.extPhase[l] === 1;
        for (let n = 0; n < frames; n++) {
          offsets[n] = (mode === PHASE ? first[n]! * PHASE_MOD_DEPTH : 0) + (ext ? this.prevLine[n]! * EXT_PHASE_DEPTH : 0);
        }
        alive = this.runModule(v, l * 2 + 1, frames, offsets, second) || alive;
        const line = this.lineOut;
        for (let n = 0; n < frames; n++) {
          const a = first[n]!, b = second[n]!;
          line[n] = mode === PHASE ? b : mode === RING ? b + a * b : a + b;
          out[offset + n] = out[offset + n]! + line[n]! * OUTPUT_GAIN;
        }
        // this line becomes the next line's EXT PHASE source
        this.lineOut = this.prevLine;
        this.prevLine = line;
      }
      if (!alive) { this.note[v] = -1; this.voicePatch[v] = null; }
    }
  }

  // One module for one block: envelope, then its waveform read at phase + offsets[n], written into dst.
  // Returns whether the module is still sounding (or could sound again while the key is held).
  private runModule(v: number, m: number, frames: number, offsets: Float64Array, dst: Float64Array): boolean {
    const mod = this.voicePatch[v]!.modules[m]!;
    if (!mod.on) { dst.fill(0, 0, frames); return false; }
    const i = v * MODULES + m, env = mod.env, gate = this.gate[v]!, sr = this.sampleRate;
    let phase = this.phase[i]!, level = this.level[i]!, step = this.step[i]!;
    const inc = this.inc[i]!, wave = mod.wave, noise = this.noise;
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
      let p = phase + offsets[n]!;
      p -= Math.floor(p);
      dst[n] = oscillator(wave, p, inc, noise) * GAIN[(level * GAIN_STEPS) | 0]!;
      phase += inc;
      if (phase >= 1) phase -= 1;
    }
    this.phase[i] = phase; this.level[i] = level; this.step[i] = step;
    return step !== DONE || level > 0 || gate === 1;
  }
}
