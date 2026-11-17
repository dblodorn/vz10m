// Voice bytes -> Patch: everything the engine reads while rendering, converted once per voice change so the
// audio loop never touches the field table. Notes keep the Patch they started with. Values that depend on the
// played key or velocity (key follow, velocity) stay raw here and are worked out at note-on.

import { get } from "../codec.ts";
import { dcoCentsPerUnit, dcoLevel, detuneSemitones, fixedHz, invertedToGain, octaveSemitones } from "./convert.ts";

export const MODULES = 8;
export const STEPS = 8;
export const KF_POINTS = 6;
export const LINES = 4;
// LINE modes, as stored (LINE_MODES in params.ts)
export const MIX = 0, PHASE = 1, RING = 2;
// LFO waves, as stored (LFO_WAVES in params.ts)
export const TRIANGLE = 0, SAW_UP = 1, SAW_DOWN = 2, SQUARE = 3;

export interface EnvelopePatch {
  rate: Float64Array; // per step, stored rate 0-127 (key follow and velocity add to it at note-on)
  level: Float64Array; // per step, target level (DCA 0-127; DCO -64..63, 0 = no change)
  velRate: Uint8Array; // per step, 1 = VELOCITY RATE applies
  sustain: number; // step index held until note-off, or -1
  end: number; // last step index, 0-7
}

export interface KeyFollowPatch {
  keys: Float64Array; // MIDI notes
  values: Float64Array;
}

export interface ModulePatch {
  on: boolean;
  wave: number; // 0-7, see WAVEFORMS
  detune: number; // semitones from the played note (key-following modules)
  fixedHz: number; // > 0: PITCH FIX, this frequency whatever the key
  env: EnvelopePatch;
  depthGain: number; // ENV DEPTH (DCA), as a gain
  kf: KeyFollowPatch; // KF LEVEL (DCA), stored (inverted) levels
  velCurve: number;
  velSens: number;
  ampSens: number; // 0-7, share of the tremolo
}

export interface LfoPatch {
  wave: number;
  depth: number; // stored 0-127
  rate: number; // stored 0-127
  delay: number; // stored 0-127
  multi: boolean; // each note runs its own LFO
}

export interface Patch {
  modules: ModulePatch[];
  lineMode: Int8Array; // per line A-D: MIX, PHASE or RING
  extPhase: Uint8Array; // per line: 1 = the previous line's output modulates this line's second module (B-D only)
  octave: number; // semitones, voice-wide
  totalGain: number; // TOTAL LEVEL, as a gain
  dco: {
    env: EnvelopePatch;
    centsPerUnit: number; // RANGE: WIDE 100, NARROW 25
    depth: number; // ENV DEPTH (DCO) 0-63
    kf: KeyFollowPatch; // KF LEVEL (DCO) 0-63
    velCurve: number;
    velSens: number;
  };
  rate: { kf: KeyFollowPatch; velCurve: number; velSens: number }; // KF RATE and VELOCITY RATE, all envelopes
  vibrato: LfoPatch;
  tremolo: LfoPatch;
}

function envelope(data: Uint8Array, prefix: string, toLevel: (stored: number) => number): EnvelopePatch {
  const rate = new Float64Array(STEPS), level = new Float64Array(STEPS), velRate = new Uint8Array(STEPS);
  let sustain = -1;
  for (let s = 0; s < STEPS; s++) {
    const k = `${prefix}.env${s + 1}`;
    rate[s] = get(data, `${k}.rate`);
    level[s] = toLevel(get(data, `${k}.level`));
    velRate[s] = get(data, `${k}.velRate`);
    // the editor allows one sustain step; a dump with several uses the first
    if (sustain < 0 && get(data, `${k}.sustain`)) sustain = s;
  }
  // stored as the last step's index: KILLER ORGAN's pitch envelope stores 7, and the manual says the end point
  // starts at step 8 (p.36)
  const end = get(data, `${prefix}.envEnd`);
  return { rate, level, velRate, sustain: sustain <= end ? sustain : -1, end };
}

function keyFollow(data: Uint8Array, prefix: string, value: string): KeyFollowPatch {
  const keys = new Float64Array(KF_POINTS), values = new Float64Array(KF_POINTS);
  for (let s = 0; s < KF_POINTS; s++) {
    keys[s] = get(data, `${prefix}.kf${s + 1}.key`);
    values[s] = get(data, `${prefix}.kf${s + 1}.${value}`);
  }
  return { keys, values };
}

function lfo(data: Uint8Array, p: string): LfoPatch {
  return { wave: get(data, `${p}.wave`), depth: get(data, `${p}.depth`), rate: get(data, `${p}.rate`), delay: get(data, `${p}.delay`), multi: get(data, `${p}.multi`) === 1 };
}

export function toPatch(data: Uint8Array): Patch {
  const modules: ModulePatch[] = [];
  for (let m = 1; m <= MODULES; m++) {
    const p = `m${m}`, note = get(data, `${p}.note`), fine = get(data, `${p}.fine`);
    modules.push({
      on: get(data, `${p}.off`) === 0,
      wave: get(data, `${p}.wave`),
      detune: detuneSemitones(get(data, `${p}.detunePlus`) === 1, note, fine),
      fixedHz: get(data, `${p}.fix`) ? fixedHz(note, fine, get(data, `${p}.fixRange`) === 1) : 0,
      env: envelope(data, p, v => v),
      depthGain: invertedToGain(get(data, `${p}.envDepth`)),
      kf: keyFollow(data, p, "level"),
      velCurve: get(data, `${p}.velCurve`),
      velSens: get(data, `${p}.velSens`),
      ampSens: get(data, `${p}.ampSens`),
    });
  }
  const lineMode = new Int8Array(LINES), extPhase = new Uint8Array(LINES);
  ["A", "B", "C", "D"].forEach((L, l) => {
    lineMode[l] = get(data, `line${L}.mode`);
    if (l > 0) extPhase[l] = get(data, `m${l * 2 + 2}.extPhase`);
  });
  return {
    modules,
    lineMode,
    extPhase,
    octave: octaveSemitones(get(data, "octavePlus") === 1, get(data, "octave")),
    totalGain: invertedToGain(get(data, "level")),
    dco: {
      env: envelope(data, "dco", dcoLevel),
      centsPerUnit: dcoCentsPerUnit(get(data, "dco.range") === 1),
      depth: get(data, "dco.envDepth"),
      kf: keyFollow(data, "dco", "level"),
      velCurve: get(data, "dco.velCurve"),
      velSens: get(data, "dco.velSens"),
    },
    rate: { kf: keyFollow(data, "rate", "rate"), velCurve: get(data, "rate.velCurve"), velSens: get(data, "rate.velSens") },
    vibrato: lfo(data, "vib"),
    tremolo: lfo(data, "trem"),
  };
}
