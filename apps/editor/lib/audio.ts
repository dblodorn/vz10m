// The editor's audio: starts it inside a click, plays the emulator (@dblodorn/casio-vz-engine's synth) and
// forwards the voice and notes to it. Same start rule as windchime's startAudio(): the AudioContext is created
// and resumed within the user's gesture, because Safari and iOS refuse to start it otherwise, and the iOS silent
// switch is unlocked in the same gesture. The context, the
// output device and SOUND off (suspend) are the editor's; the synth only plays.

import { createSynth, type Synth } from "@dblodorn/casio-vz-engine";

let ctx: AudioContext | null = null;
let synth: Synth | null = null;
let starting: Promise<void> | null = null;
let voice: Uint8Array | null = null; // latest voice, sent again when the worklet comes up
let sinkId = ""; // chosen output device; "" is the system default
let unlockEl: HTMLAudioElement | null = null; // the looping silent element (see unlock)

// 0.1 s of silence as a WAV data URL, for the unlock element
function silentWav(): string {
  const n = 4410, b = new DataView(new ArrayBuffer(44 + n * 2));
  const s = (o: number, t: string) => [...t].forEach((c, i) => b.setUint8(o + i, c.charCodeAt(0)));
  s(0, "RIFF"); b.setUint32(4, 36 + n * 2, true); s(8, "WAVEfmt "); b.setUint32(16, 16, true); b.setUint16(20, 1, true); b.setUint16(22, 1, true);
  b.setUint32(24, 44100, true); b.setUint32(28, 88200, true); b.setUint16(32, 2, true); b.setUint16(34, 16, true); s(36, "data"); b.setUint32(40, n * 2, true);
  let bin = ""; new Uint8Array(b.buffer).forEach(x => bin += String.fromCharCode(x));
  return "data:audio/wav;base64," + btoa(bin);
}

// iOS mutes web audio while the ring/silent switch is on silent, unless the page is in the playback audio
// category. Same unlock as windchime's: ask for the playback session (iOS 17+; not in the DOM lib yet, hence the
// cast), and loop a silent media element, which moves older iOS into that category. Called inside the click.
function unlock(): void {
  const nav = navigator as Navigator & { audioSession?: { type: string } };
  try { if (nav.audioSession) nav.audioSession.type = "playback"; } catch { /* not settable here */ }
  try {
    if (!unlockEl) { unlockEl = new Audio(silentWav()); unlockEl.loop = true; unlockEl.setAttribute("playsinline", ""); }
    unlockEl.play().catch(() => { /* autoplay refused: web audio still plays, just not past the silent switch */ });
  } catch { /* no media element support */ }
}

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
  unlock();
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
  unlockEl?.pause();
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
