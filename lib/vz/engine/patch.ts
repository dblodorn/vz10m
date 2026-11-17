// Voice bytes -> Patch: everything the engine reads while rendering, converted once per voice change so the
// audio loop never touches the field table. Notes keep the Patch they started with.

import { get } from "../codec.ts";
import { detuneSemitones, fixedHz, octaveSemitones, rateToSpeed } from "./convert.ts";

export const MODULES = 8;
export const STEPS = 8;
export const LINES = 4;
// LINE modes, as stored (LINE_MODES in params.ts)
export const MIX = 0, PHASE = 1, RING = 2;

export interface EnvelopePatch {
  speed: Float64Array; // per step, level units per second
  level: Float64Array; // per step, target level 0-127
  sustain: number; // step index held until note-off, or -1
  end: number; // last step index, 0-7
}

export interface ModulePatch {
  on: boolean;
  wave: number; // 0-7, see WAVEFORMS
  detune: number; // semitones from the played note (key-following modules)
  fixedHz: number; // > 0: PITCH FIX, this frequency whatever the key
  env: EnvelopePatch;
}

export interface Patch {
  modules: ModulePatch[];
  lineMode: Int8Array; // per line A-D: MIX, PHASE or RING
  extPhase: Uint8Array; // per line: 1 = the previous line's output modulates this line's second module (B-D only)
  octave: number; // semitones, voice-wide, for key-following modules
}

function envelope(data: Uint8Array, prefix: string): EnvelopePatch {
  const speed = new Float64Array(STEPS), level = new Float64Array(STEPS);
  let sustain = -1;
  for (let s = 0; s < STEPS; s++) {
    speed[s] = rateToSpeed(get(data, `${prefix}.env${s + 1}.rate`));
    level[s] = get(data, `${prefix}.env${s + 1}.level`);
    // the editor allows one sustain step; a dump with several uses the first
    if (sustain < 0 && get(data, `${prefix}.env${s + 1}.sustain`)) sustain = s;
  }
  const end = get(data, `${prefix}.envEnd`); // stored as the last step's index (unverified)
  return { speed, level, sustain: sustain <= end ? sustain : -1, end };
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
      env: envelope(data, p),
    });
  }
  const lineMode = new Int8Array(LINES), extPhase = new Uint8Array(LINES);
  ["A", "B", "C", "D"].forEach((L, l) => {
    lineMode[l] = get(data, `line${L}.mode`);
    if (l > 0) extPhase[l] = get(data, `m${l * 2 + 2}.extPhase`);
  });
  return { modules, lineMode, extPhase, octave: octaveSemitones(get(data, "octavePlus") === 1, get(data, "octave")) };
}
