# Tasks

## 1. Engine skeleton, one waveform

- [x] 1.1 `convert.ts`, `patch.ts`, `engine.ts`: modules that are on play a sine at the note's pitch through their DCA envelope (8 rate-based steps, sustain, end), mixed. A 16-voice pool; the oldest note is stolen. Verify: `pnpm test` covers envelope timing, sustain and release, voice stealing, and that render allocates nothing (steady heap over 10k blocks). Done: 9 engine tests; 16 notes render at about 200M module-samples/s in Node, against about 6M/s needed for 16 × 8 at 48 kHz.
- [x] 1.2 `worklet/vz-processor.ts` bundled by esbuild to `public/vz-worklet.js` (run by `dev` and `build`). Verify: `pnpm build` passes; the bundle loads in Chromium.
- [x] 1.3 `lib/audio.ts` and a SOUND toggle in the header; the computer keyboard plays the emulator; edits reach it at once. Verify: browser check with audio shows the worklet running and producing non-silent output after a key press.
- [x] 1.4 `scripts/render.ts voice.syx note seconds out.wav`. Verify: renders KILLER ORGAN to a non-silent WAV.

## 2. Oscillators

- [x] 2.1 SAW1–5, NOISE1/2, detune (note, fine, sign), fixed pitch and x16, octave. Verify: `test/oscillators.test.ts` (pitch within 2 cents for detune, fine, octave, fix, x16; SINE < SAW1 < … < SAW5 in brightness; no aliasing jumps at 8 kHz; repeatable noise). KILLER ORGAN's detunes read as an organ registration (−12, 0, +19, +24 semitones), which supports the semitone reading of NOTE.

## 3. Lines

- [x] 3.1 MIX, PHASE (M1 modulates M2), RING (M2 + M1×M2), external phase from the previous line. Verify: `test/lines.test.ts` checks each mode exactly against single-module renders, plus EXT PHASE, summing of lines, and that block size doesn't change the output. Worst case (16 notes × 8 modules, all modes, EXT PHASE) runs at about 4.7% of one core in Node.

## 4. Modulation

- [x] 4.1 Pitch envelope and depth/range, DCA and pitch key follow, rate key follow, velocity curves, vibrato, tremolo, env depth, total level. Semantics from the VZ-10M manual pp.35–50 (see design.md). Verify: `test/modulation.test.ts` checks each against `convert.ts`, plus no allocation with every modulation running. Worst case with all modulation runs at about 6.1% of one core in Node.
- [x] 4.2 Corrections from the manual: fixed-pitch RANGE is x1/16, not x16, and starts at F#-1 (p.35); A4 = 442 Hz (pp.41, 110). ENV DEPTH and KF LEVEL (DCA) are stored inverted like TOTAL LEVEL; the INIT voice and the editor's panel values follow.

## 5. Performance and output

- [ ] 5.1 Profile 16 notes × 8 modules in the worklet; record the CPU headroom. Move the inner loop to WebAssembly only if it doesn't fit.
- [ ] 5.2 Output-device choice (`setSinkId`) as in windchime.

## 6. Calibration

- [ ] 6.1 Record reference notes from the VZ-10M; tune `convert.ts` and the waveforms until renders match.
