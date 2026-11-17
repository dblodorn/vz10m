// Main-thread side of the emulator: starts audio inside a click, loads the worklet, and forwards the voice and
// notes to it. Same start rule as windchime's startAudio(): the AudioContext is created and resumed within the
// user's gesture, because Safari and iOS refuse to start it otherwise.

import { PROCESSOR, type ToWorklet } from "../worklet/messages.ts";

const WORKLET_URL = "/vz-worklet.js"; // built by `pnpm worklet`

let ctx: AudioContext | null = null;
let node: AudioWorkletNode | null = null;
let starting: Promise<void> | null = null;
let voice: Uint8Array | null = null; // latest voice, sent again when the worklet comes up
let sinkId = ""; // chosen output device; "" is the system default

export const supported = (): boolean =>
  typeof window !== "undefined" && typeof AudioContext === "function" && typeof AudioWorkletNode === "function";

// Output-device choice needs AudioContext.setSinkId (Chrome and Edge 110+). Elsewhere sound goes to the system output.
export const deviceChoiceSupported = (): boolean => typeof AudioContext !== "undefined" && "setSinkId" in AudioContext.prototype;

// "" is the system default. Before audio starts the choice is only remembered; start() applies it. As windchime
// does, it's applied after the context exists rather than in the constructor, where an id the browser doesn't
// list breaks the context instead of failing.
export async function setDevice(id: string): Promise<void> {
  sinkId = id;
  if (ctx && deviceChoiceSupported() && ctx.sinkId !== id) await ctx.setSinkId(id);
}

function post(m: ToWorklet): void {
  if (!node) return;
  // copy, so later edits on the main thread can't race the audio thread's view
  if (m.type === "patch") node.port.postMessage({ type: "patch", data: m.data.slice() });
  else node.port.postMessage(m);
}

// Call from a click. Resolves once the emulator is ready to play.
export function start(): Promise<void> {
  if (node && ctx) return ctx.resume();
  if (starting) return starting;
  ctx = ctx || new AudioContext({ latencyHint: "interactive" });
  const c = ctx;
  const resumed = c.resume(); // inside the gesture
  starting = (async () => {
    await c.audioWorklet.addModule(WORKLET_URL);
    node = new AudioWorkletNode(c, PROCESSOR, { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
    node.connect(c.destination);
    if (voice) post({ type: "patch", data: voice });
    if (sinkId && deviceChoiceSupported()) await c.setSinkId(sinkId).catch(() => { /* unplugged: stay on the default */ });
    await resumed;
  })().finally(() => { starting = null; });
  return starting;
}

// Silence without tearing down: the worklet stays loaded so the next start() is instant.
export async function stop(): Promise<void> {
  post({ type: "allOff" });
  if (ctx) await ctx.suspend();
}

export const running = (): boolean => !!ctx && !!node && ctx.state === "running";

export function setVoice(data: Uint8Array): void {
  voice = data;
  post({ type: "patch", data });
}

export const noteOn = (note: number, velocity = 100): void => post({ type: "noteOn", note, velocity });
export const noteOff = (note: number): void => post({ type: "noteOff", note });
export const allOff = (): void => post({ type: "allOff" });
