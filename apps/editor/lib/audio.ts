// The editor's audio: starts it inside a click, plays the emulator (@dblodorn/casio-vz-engine's synth) and
// forwards the voice and notes to it. Same start rule as windchime's startAudio(): the AudioContext is created
// and resumed within the user's gesture, because Safari and iOS refuse to start it otherwise. The context, the
// output device and SOUND off (suspend) are the editor's; the synth only plays.

import { createSynth, type Synth } from "@dblodorn/casio-vz-engine";

let ctx: AudioContext | null = null;
let synth: Synth | null = null;
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

// Call from a click. Resolves once the emulator is ready to play.
export function start(): Promise<void> {
  if (synth && ctx) return ctx.resume();
  if (starting) return starting;
  ctx = ctx || new AudioContext({ latencyHint: "interactive" });
  const c = ctx;
  const resumed = c.resume(); // inside the gesture
  starting = (async () => {
    const s = await createSynth(c);
    s.output.connect(c.destination);
    if (voice) s.loadVoice(voice);
    synth = s;
    if (sinkId && deviceChoiceSupported()) await c.setSinkId(sinkId).catch(() => { /* unplugged: stay on the default */ });
    await resumed;
  })().finally(() => { starting = null; });
  return starting;
}

// Silence without tearing down: the worklet stays loaded so the next start() is instant.
export async function stop(): Promise<void> {
  synth?.allNotesOff();
  if (ctx) await ctx.suspend();
}

export const running = (): boolean => !!ctx && !!synth && ctx.state === "running";

export function setVoice(data: Uint8Array): void {
  voice = data;
  synth?.loadVoice(data); // the synth copies it, so later edits can't race the audio thread
}

export const noteOn = (note: number, velocity = 100): void => synth?.noteOn(note, velocity);
export const noteOff = (note: number): void => synth?.noteOff(note);
export const allOff = (): void => synth?.allNotesOff();
