// Voice bytes -> Patch: everything the engine reads while rendering, converted once per voice change so the
// audio loop never touches the field table. Notes keep the Patch they started with.

import { get } from "../codec.ts";
import { rateToSpeed } from "./convert.ts";

export const MODULES = 8;
export const STEPS = 8;

export interface EnvelopePatch {
  speed: Float64Array; // per step, level units per second
  level: Float64Array; // per step, target level 0-127
  sustain: number; // step index held until note-off, or -1
  end: number; // last step index, 0-7
}

export interface ModulePatch {
  on: boolean;
  wave: number; // 0-7, see WAVEFORMS
  env: EnvelopePatch;
}

export interface Patch {
  modules: ModulePatch[];
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
    modules.push({ on: get(data, `m${m}.off`) === 0, wave: get(data, `m${m}.wave`), env: envelope(data, `m${m}`) });
  }
  return { modules };
}
