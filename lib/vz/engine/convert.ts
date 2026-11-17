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

// Mix headroom: one note with 8 full-level modules in phase peaks at 8 x OUTPUT_GAIN. ESTIMATE: set so that
// stays under full scale; chords can still clip, and TOTAL LEVEL / ENV DEPTH (step 4) will bring most voices down.
export const OUTPUT_GAIN = 0.1;
