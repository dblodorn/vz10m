# Proposal

## Why

The editor can only be heard through the hardware. A browser emulator of the VZ-10M's iPD synthesis lets voices be auditioned anywhere, with or without the VZ connected. It is also the base for comparing edits A/B against the hardware.

## What Changes

- `lib/vz/engine/`: a TypeScript iPD engine that runs both in Node (tests, offline WAV renders) and in an AudioWorklet. It doesn't allocate while rendering. It reads the same 336 voice bytes the editor edits.
- `lib/vz/engine/convert.ts`: the one calibration file that turns stored values into rates, levels and pitches. Every curve in it is an estimate until it's measured against the hardware.
- `worklet/vz-processor.ts`, bundled by esbuild into `public/vz-worklet.js`.
- `lib/audio.ts`: starts audio from a click, loads the worklet, and passes voice edits and notes to it.
- A SOUND toggle in the editor. The computer keyboard plays the emulator while it's on, and also the VZ when MIDI OUT is connected.
- `scripts/render.ts`: renders a voice and note to a WAV.

Built in steps (see `tasks.md`): one module at a time, then waveforms, lines, modulation, polyphony, and calibration.

## Non-goals

- Bit-exact or sample-exact emulation. The aim is VZ-shaped now and VZ-accurate after calibration.
- WebAssembly. The engine sits behind one `render()` call, so its inner loop can move to WebAssembly later if profiling demands it.
- Operation memory, combinations and multi-channel performance.

## Capabilities

### New Capabilities
- `vz-engine`: how a voice's bytes become sound.
- `audio-output`: starting audio and playing the emulator from the page.
