# Design

## Language and runtime

The engine is TypeScript, with no WebAssembly. A VZ-10M plays at most 16 notes (owner's manual p.5: "total 16-note MIDI polyphony"), each with up to 8 modules. That is about 128 oscillators: per sample, a phase step, a table lookup, an envelope step and a multiply. JIT-compiled typed-array loops handle this in an AudioWorklet with room to spare.

- The engine never allocates inside `render()`. All per-voice state lives in typed arrays sized at construction.
- A voice change is converted once on arrival (`convert.ts`), never per sample.
- WebAssembly stays a later option behind the same `render(out, frames)` call, only if profiling demands it.

## Layout

- `lib/vz/engine/convert.ts`: stored value → physical value (rate → levels per second, level → gain, note → Hz). This is the calibration file.
- `lib/vz/engine/patch.ts`: voice bytes → `Patch`, a plain read-only description built once per voice change.
- `lib/vz/engine/engine.ts`: `Engine`, which holds the voice pool, `noteOn` / `noteOff` / `allOff` / `setPatch`, and `render(out, frames)`.
- `worklet/vz-processor.ts`: an `AudioWorkletProcessor` that owns one `Engine` and takes port messages: `patch` (bytes), `noteOn`, `noteOff`, `allOff`.
- `lib/audio.ts`: on the main thread. It creates the AudioContext inside a click (iOS requires this, as in windchime's `startAudio()`), loads the worklet, and posts messages to it.

## Envelopes (rate-based)

Each step has a RATE and a LEVEL. RATE is how fast the envelope moves toward the step's LEVEL, so a step's duration depends on the distance it travels. This is how the VZ panel describes it ("rate", not "time").

- The level moves linearly in level units, which are roughly decibels, and is turned into gain at the output.
- **Sustain:** the envelope holds at the sustain step's level until note-off. Note-off jumps to the step after the sustain step.
- **End:** the envelope finishes at END STEP and holds that level. A voice is freed once every active module has finished at level 0, or has gone silent after release.

## Estimates to calibrate (all in `convert.ts`)

| Curve | Estimate |
|---|---|
| rate → speed | exponential: rate 0 crosses the full 0–127 range in about 40 s, rate 127 in about 1 ms |
| level → gain | 0.75 dB per step below 127; 0 is silence |
| env depth / total level | same dB scale (total level is stored inverted: 0 is loudest) |
| SAW1–5 | phase-distorted sine, breakpoints 0.32 / 0.22 / 0.14 / 0.08 / 0.04 of the cycle; the bend is never shorter than 2 samples (anti-aliasing) |
| NOISE1 / NOISE2 | white noise / half noise, half the note's sine |
| detune | NOTE in semitones, FINE in 100/64-cent steps |
| PHASE / EXT PHASE depth | a full-level modulator swings the carrier's phase by ±1 cycle |
| PITCH FIX | NOTE + FINE read as an absolute MIDI pitch; x16 multiplies the frequency by 16; OCTAVE doesn't apply |

## Build order

1. Engine, worklet and audio start. Every module that's on plays a sine at the note's pitch, through its own DCA envelope, mixed. 16-voice pool, oldest note stolen.
2. All 8 waves, detune, fixed pitch, octave.
3. Lines (mix / phase / ring) and external phase.
4. Pitch envelope, key follow, velocity, vibrato, tremolo, env depth, total level.
5. Profiling at 16 notes × 8 modules, and an output-device choice.
6. Calibration against hardware recordings (`scripts/render.ts` makes matching renders).
