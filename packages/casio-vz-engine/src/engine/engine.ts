// The iPD engine: a pool of 16 voices x 8 modules, rendered in blocks into a mono buffer.
// Runs unchanged in Node (tests, scripts/render.ts) and in the AudioWorklet (worklet/processor.ts).
// render() allocates nothing: all state is in typed arrays sized here.
//
// Every module that is on plays its waveform at its own pitch (the key plus OCTAVE and DETUNE, or a fixed
// frequency), moved by the pitch envelope and vibrato, through its DCA envelope, ENV DEPTH, key follow,
// velocity and tremolo. Modules pair into lines A-D (M1+M2 ... M7+M8); the second module always feeds the line:
//   MIX    M1 + M2
//   PHASE  M2 with M1 added to its phase
//   RING   M2 + M1 x M2
// With EXT PHASE, the previous line's output is also added to the second module's phase (lines B-D), and that
// previous line is then not heard: "LINEs which are used as external phase do not sound" (manual p.13).
// The lines that sound are summed.
//
// Fixed per note at note-on: rates (KF RATE, VELOCITY RATE), module gains (ENV DEPTH, KF LEVEL, VELOCITY LEVEL,
// TOTAL LEVEL) and the pitch envelope's depth (ENV DEPTH, KF LEVEL and VELOCITY LEVEL of the DCO).

import {
  AMP_SENS_MAX, DCO_DEPTH_MAX, EXT_PHASE_DEPTH, invertedToGain, keyFollow, LEVEL_MAX, levelToGain, lfoDelaySeconds,
  lfoDepth, LFO_FADE_SECONDS, lfoHz, noteToHz, OUTPUT_GAIN, PHASE_MOD_DEPTH, rateToSpeed, velocityRateAdd,
  velocityScale, VIBRATO_MAX_CENTS,
} from "./convert.ts";
import { LINES, MODULES, PHASE, RING, SAW_DOWN, SAW_UP, SQUARE, STEPS, type EnvelopePatch, type Patch } from "./patch.ts";
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

// LFO wave at phase p (cycles). Vibrato: TRIANGLE swings both ways, the others rise from the note (manual p.40:
// "Saw Up - a repeating pitch rise starting from the fundamental", "Square - a trill between the original pitch
// and a higher pitch"). Tremolo uses the 0-1 form of each wave and only ever lowers the volume.
function lfoValue(wave: number, p: number, bipolar: boolean): number {
  if (wave === SAW_UP) return p;
  if (wave === SAW_DOWN) return 1 - p;
  if (wave === SQUARE) return p < 0.5 ? 0 : 1;
  const tri = 1 - 4 * Math.abs(p - 0.5); // -1 at the start of the cycle, 1 halfway
  return bipolar ? tri : (tri + 1) / 2;
}

const frac = (x: number): number => x - Math.floor(x);
const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

export class Engine {
  readonly sampleRate: number;
  private patch: Patch | null = null;

  private readonly voicePatch: (Patch | null)[] = new Array(VOICES).fill(null);
  private readonly note = new Int16Array(VOICES).fill(-1); // -1: free
  private readonly gate = new Uint8Array(VOICES);
  private readonly started = new Float64Array(VOICES); // note-on order, for stealing
  private counter = 0;
  private readonly age = new Float64Array(VOICES); // samples since note-on, for LFO delay

  // per voice x module
  private readonly phase = new Float64Array(VOICES * MODULES);
  private readonly inc = new Float64Array(VOICES * MODULES);
  private readonly level = new Float64Array(VOICES * MODULES); // envelope level, 0-127
  private readonly step = new Int8Array(VOICES * MODULES); // current step, or DONE
  private readonly gain = new Float64Array(VOICES * MODULES); // ENV DEPTH x KF x velocity x TOTAL LEVEL
  private readonly speed = new Float64Array(VOICES * MODULES * STEPS); // level units per sample, per step

  // per voice: the pitch (DCO) envelope and the LFOs
  private readonly dcoLevel = new Float64Array(VOICES);
  private readonly dcoStep = new Int8Array(VOICES);
  private readonly dcoSpeed = new Float64Array(VOICES * STEPS);
  private readonly dcoCents = new Float64Array(VOICES); // cents per envelope level unit, for this note
  private readonly vibPhase = new Float64Array(VOICES); // MULTI: each note's own LFO
  private readonly tremPhase = new Float64Array(VOICES);
  private globalVib = 0; // MULTI off: one LFO for every note
  private globalTrem = 0;

  private readonly fadePerSample: number;
  private readonly noise = new Noise();

  // scratch, one block long
  private readonly first = new Float64Array(BLOCK); // a line's two module outputs
  private readonly second = new Float64Array(BLOCK);
  private readonly offsets = new Float64Array(BLOCK); // phase offsets for the module being rendered
  private readonly pitch = new Float64Array(BLOCK); // frequency multiplier: pitch envelope + vibrato
  private readonly trem = new Float64Array(BLOCK); // tremolo, 0-1 of full depth
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
    const patch = this.patch;
    if (!patch) return;
    const v = this.pickVoice(note), sr = this.sampleRate;
    const vel = Math.max(0, Math.min(127, velocity)) / 127;
    this.note[v] = note;
    this.gate[v] = 1;
    this.started[v] = ++this.counter;
    this.voicePatch[v] = patch;
    this.age[v] = 0;
    this.vibPhase[v] = 0;
    this.tremPhase[v] = 0;

    // rates: KF RATE for this key, plus VELOCITY RATE on the steps marked for it
    const rateKf = keyFollow(patch.rate.kf.keys, patch.rate.kf.values, note);
    const rateVel = velocityRateAdd(patch.rate.velCurve, patch.rate.velSens, vel);
    const speeds = (env: EnvelopePatch, out: Float64Array, at: number) => {
      for (let s = 0; s < STEPS; s++) out[at + s] = rateToSpeed(env.rate[s]! + rateKf + (env.velRate[s] ? rateVel : 0)) / sr;
    };

    for (let m = 0; m < MODULES; m++) {
      const i = v * MODULES + m, mod = patch.modules[m]!;
      const hz = mod.fixedHz > 0 ? mod.fixedHz * Math.pow(2, patch.octave / 12) : noteToHz(note + patch.octave + mod.detune);
      this.phase[i] = 0;
      this.inc[i] = Math.min(hz / sr, NYQUIST);
      this.level[i] = 0;
      this.step[i] = mod.on ? 0 : DONE;
      const kf = invertedToGain(keyFollow(mod.kf.keys, mod.kf.values, note));
      // a weak attack shifts the envelope down: what's left of it, as a gain on the level scale
      const vg = levelToGain(LEVEL_MAX * velocityScale(mod.velCurve, mod.velSens, vel));
      this.gain[i] = mod.depthGain * kf * vg * patch.totalGain;
      speeds(mod.env, this.speed, i * STEPS);
    }

    const dco = patch.dco;
    this.dcoLevel[v] = 0;
    this.dcoStep[v] = 0;
    speeds(dco.env, this.dcoSpeed, v * STEPS);
    this.dcoCents[v] = dco.centsPerUnit * (dco.depth / DCO_DEPTH_MAX)
      * (keyFollow(dco.kf.keys, dco.kf.values, note) / DCO_DEPTH_MAX)
      * velocityScale(dco.velCurve, dco.velSens, vel);
  }

  noteOff(note: number): void {
    for (let v = 0; v < VOICES; v++) {
      if (this.note[v] !== note || !this.gate[v]) continue;
      this.gate[v] = 0;
      const patch = this.voicePatch[v]!;
      // before or at the sustain step: go on from the step after it
      const release = (env: EnvelopePatch, step: number): number =>
        env.sustain >= 0 && step !== DONE && step <= env.sustain ? (env.sustain + 1 <= env.end ? env.sustain + 1 : DONE) : step;
      for (let m = 0; m < MODULES; m++) {
        const i = v * MODULES + m;
        this.step[i] = release(patch.modules[m]!.env, this.step[i]!);
      }
      this.dcoStep[v] = release(patch.dco.env, this.dcoStep[v]!);
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
      this.modulation(v, patch, frames);
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
        // a line feeding the next line's EXT PHASE is only a modulator
        const heard = l === LINES - 1 || patch.extPhase[l + 1] !== 1;
        for (let n = 0; n < frames; n++) {
          const a = first[n]!, b = second[n]!;
          line[n] = mode === PHASE ? b : mode === RING ? b + a * b : a + b;
          if (heard) out[offset + n] = out[offset + n]! + line[n]! * OUTPUT_GAIN;
        }
        // this line becomes the next line's EXT PHASE source
        this.lineOut = this.prevLine;
        this.prevLine = line;
      }
      this.age[v] = this.age[v]! + frames;
      if (!alive) { this.note[v] = -1; this.voicePatch[v] = null; }
    }
    // the shared (MULTI off) LFOs run whether or not a note is sounding
    const p = this.patch;
    if (p) {
      this.globalVib = frac(this.globalVib + (lfoHz(p.vibrato.rate) * frames) / this.sampleRate);
      this.globalTrem = frac(this.globalTrem + (lfoHz(p.tremolo.rate) * frames) / this.sampleRate);
    }
  }

  // This voice's pitch multiplier (pitch envelope + vibrato) and tremolo for the block, into this.pitch / this.trem.
  private modulation(v: number, patch: Patch, frames: number): void {
    const sr = this.sampleRate, age = this.age[v]!, pitch = this.pitch, trem = this.trem;
    const vib = patch.vibrato, tr = patch.tremolo;
    const env = patch.dco.env, cents = this.dcoCents[v]!, gate = this.gate[v]!, sp = v * STEPS;
    const vibCents = lfoDepth(vib.depth) * VIBRATO_MAX_CENTS, tremDepth = lfoDepth(tr.depth);
    const vibDelay = lfoDelaySeconds(vib.delay), tremDelay = lfoDelaySeconds(tr.delay);
    const vibInc = lfoHz(vib.rate) / sr, tremInc = lfoHz(tr.rate) / sr;
    const vibStart = vib.multi ? this.vibPhase[v]! : this.globalVib;
    const tremStart = tr.multi ? this.tremPhase[v]! : this.globalTrem;

    let level = this.dcoLevel[v]!, step = this.dcoStep[v]!;
    for (let n = 0; n < frames; n++) {
      // pitch envelope: same stepping as the DCA envelopes, in signed level units
      if (step !== DONE) {
        const target = env.level[step]!, d = this.dcoSpeed[sp + step]!;
        if (level < target) level = Math.min(target, level + d);
        else if (level > target) level = Math.max(target, level - d);
        if (level === target && !(gate && step === env.sustain)) step = step >= env.end ? DONE : step + 1;
      }
      const t = (age + n) / sr;
      let c = level * cents;
      if (vibCents > 0) {
        const fade = clamp01((t - vibDelay) / LFO_FADE_SECONDS);
        if (fade > 0) c += fade * vibCents * lfoValue(vib.wave, frac(vibStart + n * vibInc), true);
      }
      pitch[n] = c === 0 ? 1 : Math.pow(2, c / 1200);
      if (tremDepth > 0) {
        const fade = clamp01((t - tremDelay) / LFO_FADE_SECONDS);
        trem[n] = fade > 0 ? fade * tremDepth * lfoValue(tr.wave, frac(tremStart + n * tremInc), false) : 0;
      } else {
        trem[n] = 0;
      }
    }
    this.dcoLevel[v] = level;
    this.dcoStep[v] = step;
    if (vib.multi) this.vibPhase[v] = frac(vibStart + frames * vibInc);
    if (tr.multi) this.tremPhase[v] = frac(tremStart + frames * tremInc);
  }

  // One module for one block: envelope, then its waveform read at phase + offsets[n], written into dst.
  // Returns whether the module is still sounding (or could sound again while the key is held).
  private runModule(v: number, m: number, frames: number, offsets: Float64Array, dst: Float64Array): boolean {
    const mod = this.voicePatch[v]!.modules[m]!;
    if (!mod.on) { dst.fill(0, 0, frames); return false; }
    const i = v * MODULES + m, env = mod.env, gate = this.gate[v]!, sp = i * STEPS;
    let phase = this.phase[i]!, level = this.level[i]!, step = this.step[i]!;
    const inc = this.inc[i]!, wave = mod.wave, noise = this.noise, gain = this.gain[i]!;
    const sens = mod.ampSens / AMP_SENS_MAX, pitch = this.pitch, trem = this.trem;
    for (let n = 0; n < frames; n++) {
      // envelope: move toward this step's level at its rate; advance when it gets there
      if (step !== DONE) {
        const target = env.level[step]!, d = this.speed[sp + step]!;
        if (level < target) level = Math.min(target, level + d);
        else if (level > target) level = Math.max(target, level - d);
        if (level === target && !(gate && step === env.sustain)) step = step >= env.end ? DONE : step + 1;
      } else if (!gate && level > 0) {
        level = Math.max(0, level - this.fadePerSample);
      }
      let p = phase + offsets[n]!;
      p -= Math.floor(p);
      const stepInc = Math.min(inc * pitch[n]!, NYQUIST);
      dst[n] = oscillator(wave, p, stepInc, noise) * GAIN[(level * GAIN_STEPS) | 0]! * gain * (1 - trem[n]! * sens);
      phase += stepInc;
      if (phase >= 1) phase -= 1;
    }
    this.phase[i] = phase; this.level[i] = level; this.step[i] = step;
    return step !== DONE || level > 0 || gate === 1;
  }
}
