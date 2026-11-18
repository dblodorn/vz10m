// Checks shared by the AudioWorklet synth and the offline synth, so both refuse the same input with the same
// errors. They throw before anything reaches the engine, so a bad call never changes what is playing.

const midi = (what: string, value: number, min: number): number => {
  if (!Number.isInteger(value) || value < min || value > 127) throw new RangeError(`${what} must be a whole number from ${min} to 127, got ${value}.`);
  return value;
};

export const checkNote = (note: number): number => midi("Note", note, 0);
export const checkVelocity = (velocity: number): number => midi("Velocity", velocity, 0);

export function checkSampleRate(sampleRate: number): number {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) throw new RangeError(`Sample rate must be a positive number, got ${sampleRate}.`);
  return sampleRate;
}

// What one note-on means: velocity 0 is a note-off, as in MIDI.
export const noteOnEvent = (note: number, velocity: number): { note: number; velocity: number; off: boolean } => {
  checkNote(note);
  checkVelocity(velocity);
  return { note, velocity, off: velocity === 0 };
};
