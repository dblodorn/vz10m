// Stored VZ values -> physical quantities. This is the calibration file: every curve here is either sourced
// (cited) or an ESTIMATE until it is measured against a VZ-10M (task 6.1 of openspec/changes/vz10m-emulator).
// Nothing else in the engine should hold a number that describes how the VZ sounds.
//
// "Manual" means the VZ-10M owner's manual (MENU 1 voice parameters, pp.35-50).

// ---------- levels and rates ----------

// Envelope levels and rates are stored 0-127 (riban vzvoice.cpp masks them with 0x7F); the panel shows 0-99.
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

// TOTAL LEVEL, ENV DEPTH (DCA) and KF LEVEL (DCA) are stored inverted: 0x00-0x7F = 99-0 on the panel (riban's
// notes, footnote 5, shared by all three). Manual: TOTAL LEV 00 is silent, 99 the most; ENV DEPTH and KF LEVEL
// lower the module's whole envelope. KILLER ORGAN stores 0 in all of them and is a full-level organ.
// ESTIMATE: on the same dB scale as envelope levels.
export const invertedToGain = (stored: number): number => levelToGain(LEVEL_MAX - stored);

// ---------- pitch ----------

// Manual p.41: OCTAVE 0 is "the standard pitch level (A4=442Hz)"; TUNE (MENU 3) defaults to 442 (p.110).
export const A4_HZ = 442;
export const noteToHz = (note: number): number => A4_HZ * Math.pow(2, (note - 69) / 12);

// DETUNE (manual p.35): OCT 0-5 and NOTE 0-11 in semitones (stored together as one 0-71 semitone count), FINE
// 0-63 in "1.6-cent increments (approximate)". ESTIMATE: 100/64 cents per step.
export const CENTS_PER_FINE = 100 / 64;
export const detuneSemitones = (plus: boolean, note: number, fine: number): number =>
  (plus ? 1 : -1) * (note + (fine * CENTS_PER_FINE) / 100);

// PITCH FIX (manual p.35): the module ignores the key. With OCT, NOTE and FINE at 0 it sounds F#-1 (MIDI note 6),
// rising with them across about F#-1 to C#10; RANGE x1/16 shifts that range down 4 octaves (to about F#-5).
export const FIX_BASE_NOTE = 6;
export const FIX_LOW_RANGE = 1 / 16;
export const fixedHz = (note: number, fine: number, low: boolean): number =>
  noteToHz(FIX_BASE_NOTE + note + (fine * CENTS_PER_FINE) / 100) * (low ? FIX_LOW_RANGE : 1);

// OCTAVE (manual p.41): -2 to +2 for all 8 modules. ESTIMATE: fixed-pitch modules follow it too ("correspond to
// the MIDI instrument pitch (and OCTAVE parameter setting)", p.35).
export const octaveSemitones = (plus: boolean, octave: number): number => (plus ? 1 : -1) * 12 * octave;

// ---------- pitch envelope (DCO) ----------

// Manual p.36: levels -63..+63, 0 = no change. ESTIMATE: stored with 64 as 0 (KILLER ORGAN stores 64 in every step).
export const dcoLevel = (stored: number): number => stored - 64;
// Manual p.37: WIDE, one level unit is 100 cents (up to about +/-5 octaves); NARROW, 25 cents.
export const dcoCentsPerUnit = (wide: boolean): number => (wide ? 100 : 25);
// ENV DEPTH (DCO) 0-63 scales the envelope: 63 as set, 0 no pitch change (p.37). KF LEVEL (DCO) 0-63 does the
// same per key: 63 full, 0 "contour disappears" (p.38).
export const DCO_DEPTH_MAX = 63;

// ---------- velocity ----------

// The 8 velocity curves (manual pp.39, 45, 50 graphs): response 0-1 to velocity 0-1.
// ESTIMATE: shapes read off the graphs. 1 slow then steep, 2 steeper, 3 linear, 4 falling, 5 fast then flat,
// 6 flat then a rise near the middle, 7 off below half / on above, 8 the reverse.
export function velocityCurve(curve: number, v: number): number {
  switch (curve) {
    case 0: return v * v;
    case 1: return v * v * v;
    case 2: return v;
    case 3: return 1 - v;
    case 4: return Math.sqrt(v);
    case 5: return v < 0.4 ? 0.15 : v > 0.7 ? 1 : 0.15 + ((v - 0.4) / 0.3) * 0.85;
    case 6: return v >= 0.5 ? 1 : 0;
    default: return v >= 0.5 ? 0 : 1;
  }
}
export const VEL_SENS_MAX = 31;

// VELOCITY LEVEL (DCA / DCO): a weak attack shifts the envelope down (pp.39, 45). Returns 0-1, the share of the
// envelope left. SENS 0 ignores velocity; ESTIMATE: SENS 31 takes the shift all the way to silence.
export const velocityScale = (curve: number, sens: number, v: number): number =>
  1 - (sens / VEL_SENS_MAX) * (1 - velocityCurve(curve, v));

// VELOCITY RATE (p.50): "additive values to the rate parameter" on the steps marked VEL RATE.
// ESTIMATE: SENS 31 at full response adds the whole rate range.
export const velocityRateAdd = (curve: number, sens: number, v: number): number =>
  (sens / VEL_SENS_MAX) * velocityCurve(curve, v) * LEVEL_MAX;

// ---------- key follow ----------

// Six (key, value) points; keys are MIDI notes (C0 = 12 ... C9 = 120, the manual's C0-C9 range). Between points
// the value is interpolated; outside them it holds the nearest point's value. ESTIMATE: straight lines.
export function keyFollow(keys: ArrayLike<number>, values: ArrayLike<number>, note: number): number {
  const n = keys.length;
  if (note <= keys[0]!) return values[0]!;
  for (let i = 1; i < n; i++) {
    if (note <= keys[i]!) {
      const k0 = keys[i - 1]!, k1 = keys[i]!;
      return k1 === k0 ? values[i]! : values[i - 1]! + ((values[i]! - values[i - 1]!) * (note - k0)) / (k1 - k0);
    }
  }
  return values[n - 1]!;
}
// KF RATE (p.49) adds to every DCO and DCA envelope rate where it is higher. ESTIMATE: in stored rate units.

// ---------- LFOs ----------

// Vibrato and tremolo DEPTH, RATE, DELAY are 0-99 on the panel (pp.40, 46), stored 0-127.
// ESTIMATE: rate 0.1-15 Hz exponentially, delay 0-5 s, vibrato depth up to 100 cents, tremolo down to silence.
export const lfoHz = (stored: number): number => 0.1 * Math.pow(150, stored / 127);
export const lfoDelaySeconds = (stored: number): number => (stored / 127) * 5;
export const VIBRATO_MAX_CENTS = 100;
export const lfoDepth = (stored: number): number => stored / 127;
// the LFO fades in over this long once its delay is over
export const LFO_FADE_SECONDS = 0.05;
// AMP SENS 0-7 (p.47): how much of the tremolo each module takes; 0 none, 7 all.
export const AMP_SENS_MAX = 7;

// ---------- lines ----------

// PHASE: M1's output (after its DCA) is added to M2's phase. ESTIMATE: a full-level M1 swings M2's phase by
// this many cycles each way. EXT PHASE uses the previous line's output the same way.
export const PHASE_MOD_DEPTH = 1;
export const EXT_PHASE_DEPTH = 1;

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

// Mix headroom: one note with 8 full-level modules in phase peaks at 8 x OUTPUT_GAIN. ESTIMATE: set so that
// stays under full scale; chords can still clip.
export const OUTPUT_GAIN = 0.1;
