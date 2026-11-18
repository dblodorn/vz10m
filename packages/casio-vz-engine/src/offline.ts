// The engine without Web Audio: for Node (tests, rendering to files) or anywhere samples are wanted directly.
// Same voice loading and note rules as the AudioWorklet synth, and the same engine, so the same calls give the
// same samples.

import { readVoice } from "./codec.ts";
import { Engine } from "./engine/engine.ts";
import { toPatch } from "./engine/patch.ts";
import { checkNote, checkSampleRate, noteOnEvent } from "./notes.ts";

export interface OfflineSynth {
  readonly sampleRate: number;
  // 336 voice bytes or one voice SysEx message. Throws on anything else and keeps the voice it had.
  loadVoice(voice: Uint8Array): void;
  // note 0-127, velocity 0-127 (0 is a note-off). Throws on values out of range.
  noteOn(note: number, velocity?: number): void;
  noteOff(note: number): void;
  allNotesOff(): void;
  // Writes `frames` samples (mono) into out[offset...], replacing what was there.
  render(out: Float32Array, frames?: number, offset?: number): void;
}

export function createOfflineSynth(sampleRate: number): OfflineSynth {
  const engine = new Engine(checkSampleRate(sampleRate));
  return {
    sampleRate,
    loadVoice(voice) { engine.setPatch(toPatch(readVoice(voice))); },
    noteOn(note, velocity = 100) {
      const e = noteOnEvent(note, velocity);
      if (e.off) engine.noteOff(note); else engine.noteOn(note, velocity);
    },
    noteOff(note) { engine.noteOff(checkNote(note)); },
    allNotesOff() { engine.allOff(); },
    render(out, frames = out.length, offset = 0) {
      if (offset < 0 || frames < 0 || offset + frames > out.length) throw new RangeError(`Can't render ${frames} frames at ${offset} into ${out.length}.`);
      out.fill(0, offset, offset + frames);
      engine.render(out, frames, offset);
    },
  };
}
