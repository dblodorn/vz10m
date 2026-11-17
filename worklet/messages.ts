// Main thread -> emulator worklet. Shared by lib/audio.ts and worklet/vz-processor.ts.
export const PROCESSOR = "vz-processor";

export type ToWorklet =
  | { type: "patch"; data: Uint8Array } // 336 decoded voice bytes
  | { type: "noteOn"; note: number; velocity: number }
  | { type: "noteOff"; note: number }
  | { type: "allOff" };
