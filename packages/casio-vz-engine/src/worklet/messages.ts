// Main thread -> emulator worklet. Shared by the synth and worklet/processor.ts. The processor name carries the
// package's name, so engines from different packages can share one AudioContext.
export const PROCESSOR = "casio-vz-engine";

export type ToWorklet =
  | { type: "patch"; data: Uint8Array } // 336 decoded voice bytes
  | { type: "noteOn"; note: number; velocity: number }
  | { type: "noteOff"; note: number }
  | { type: "allOff" };
