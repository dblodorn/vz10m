# Tasks

## 1. Engine skeleton, one waveform

- [x] 1.1 `convert.ts`, `patch.ts`, `engine.ts`: modules that are on play a sine at the note's pitch through their DCA envelope (8 rate-based steps, sustain, end), mixed. A 16-voice pool; the oldest note is stolen. Verify: `pnpm test` covers envelope timing, sustain and release, voice stealing, and that render allocates nothing (steady heap over 10k blocks). Done: 9 engine tests; 16 notes render at about 200M module-samples/s in Node, against about 6M/s needed for 16 × 8 at 48 kHz.
- [x] 1.2 `worklet/vz-processor.ts` bundled by esbuild to `public/vz-worklet.js` (run by `dev` and `build`). Verify: `pnpm build` passes; the bundle loads in Chromium.
- [x] 1.3 `lib/audio.ts` and a SOUND toggle in the header; the computer keyboard plays the emulator; edits reach it at once. Verify: browser check with audio shows the worklet running and producing non-silent output after a key press.
- [x] 1.4 `scripts/render.ts voice.syx note seconds out.wav`. Verify: renders KILLER ORGAN to a non-silent WAV.

## 2. Oscillators

- [ ] 2.1 SAW1–5, NOISE1/2, detune (note, fine, sign), fixed pitch and x16, octave.

## 3. Lines

- [ ] 3.1 MIX, PHASE (M1 modulates M2), RING (M2 + M1×M2), external phase from the previous line.

## 4. Modulation

- [ ] 4.1 Pitch envelope and depth/range, DCA and pitch key follow, rate key follow, velocity curves, vibrato, tremolo, env depth, total level.

## 5. Performance and output

- [ ] 5.1 Profile 16 notes × 8 modules in the worklet; record the CPU headroom. Move the inner loop to WebAssembly only if it doesn't fit.
- [ ] 5.2 Output-device choice (`setSinkId`) as in windchime.

## 6. Calibration

- [ ] 6.1 Record reference notes from the VZ-10M; tune `convert.ts` and the waveforms until renders match.
