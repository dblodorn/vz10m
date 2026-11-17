// Stored VZ values -> physical quantities. This is the calibration file: every curve here is an ESTIMATE until
// it is measured against a VZ-10M (task 6.1 of openspec/changes/vz10m-emulator). Nothing else in the engine
// should hold a number that describes how the VZ sounds.

// Envelope levels and rates are stored 0-127 (riban vzvoice.cpp masks them with 0x7F).
export const LEVEL_MAX = 127;

// ESTIMATE: rate is a speed, in level units per second, rising exponentially with the stored rate.
// Rate 0 crosses the whole 0-127 range in about 40 s, rate 127 in about 1 ms.
const SLOWEST = LEVEL_MAX / 40;
const FASTEST = LEVEL_MAX / 0.001;
export function rateToSpeed(rate: number): number {
  return SLOWEST * Math.pow(FASTEST / SLOWEST, Math.max(0, Math.min(127, rate)) / 127);
}

// ESTIMATE: levels are roughly decibels, 0.75 dB per step below 127; level 0 is silence.
export const DB_PER_LEVEL = 0.75;
export function levelToGain(level: number): number {
  if (level <= 0) return 0;
  return Math.pow(10, ((Math.min(level, LEVEL_MAX) - LEVEL_MAX) * DB_PER_LEVEL) / 20);
}

// ESTIMATE: TOTAL LEVEL is stored inverted (0x00-0x7F = 99-0 on the panel, per riban's notes); same dB scale.
export const totalLevelToGain = (stored: number): number => levelToGain(LEVEL_MAX - stored);

// Equal temperament, A4 = 440 Hz. The VZ's TUNE (MENU 3) shifts this; not modelled yet.
export const noteToHz = (note: number): number => 440 * Math.pow(2, (note - 69) / 12);

// ---------- pitch ----------

// DETUNE: NOTE is whole semitones, FINE is 0-63 steps of about 1.6 cents ("+/-100 cent (63 x 1.6 cent steps)",
// riban's notes). ESTIMATE: 100/64 cents per step, so FINE 63 is just under a semitone.
export const CENTS_PER_FINE = 100 / 64;
export const detuneSemitones = (plus: boolean, note: number, fine: number): number =>
  (plus ? 1 : -1) * (note + (fine * CENTS_PER_FINE) / 100);

// PITCH FIX: the module ignores the key. ESTIMATE: its NOTE + FINE are read as an absolute MIDI pitch (the
// 0-127 NOTE range matches MIDI's), and x16 multiplies that frequency by 16.
export const FIX_RANGE_MULTIPLIER = 16;
export const fixedHz = (note: number, fine: number, x16: boolean): number =>
  noteToHz(note + (fine * CENTS_PER_FINE) / 100) * (x16 ? FIX_RANGE_MULTIPLIER : 1);

// OCTAVE (voice-wide): 12 semitones per step, applied to modules that follow the key. ESTIMATE: fixed-pitch
// modules ignore it.
export const octaveSemitones = (plus: boolean, octave: number): number => (plus ? 1 : -1) * 12 * octave;

// ---------- waveforms ----------

// SAW1-SAW5 are phase distortion: a sine read through a bent phase that rushes through the first half of the
// cycle in `breakpoint` of the period. 0.5 is a pure sine; smaller is brighter. ESTIMATE: the five breakpoints
// rise in brightness from SAW1 to SAW5 as the VZ's harmonic content does; their values are not measured.
export const SAW_BREAKPOINTS = [0.32, 0.22, 0.14, 0.08, 0.04] as const;
// Anti-aliasing: the bent part of the cycle is never shorter than this many samples, so high notes soften
// toward a sine instead of folding harmonics back down.
export const PD_MIN_SAMPLES = 2;
// NOISE2 "includes some fundamental pitch" (riban's notes). ESTIMATE: this much of the note's sine under the noise.
export const NOISE2_TONE = 0.5;

// ---------- lines ----------

// PHASE: M1's output (after its DCA) is added to M2's phase. ESTIMATE: a full-level M1 swings M2's phase by
// this many cycles each way. EXT PHASE uses the previous line's output the same way.
export const PHASE_MOD_DEPTH = 1;
export const EXT_PHASE_DEPTH = 1;

// Mix headroom: one note with 8 full-level modules in phase peaks at 8 x OUTPUT_GAIN. ESTIMATE: set so that
// stays under full scale; chords can still clip, and TOTAL LEVEL / ENV DEPTH (step 4) will bring most voices down.
export const OUTPUT_GAIN = 0.1;
