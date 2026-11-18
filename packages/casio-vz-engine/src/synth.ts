// The emulator as an AudioWorklet node in the host's own AudioContext. The host owns the context: it creates it
// (inside a click, for browsers that need a gesture), resumes, suspends and closes it. This module only adds
// the worklet module once per context and makes nodes. Nothing here runs at import time, so it is safe to
// import during server rendering.

import { readVoice } from "./codec.ts";
import { checkNote, noteOnEvent } from "./notes.ts";
import code from "./worklet/code.generated.ts";
import { PROCESSOR, type ToWorklet } from "./worklet/messages.ts";

export interface SynthOptions {
  // Where to load the worklet from, for pages whose Content-Security-Policy refuses blob: scripts. Serve the
  // package's `worklet.js` (`@dblodorn/casio-vz-engine/worklet.js`) and pass its URL. By default the worklet is
  // loaded from a Blob URL made from code inside the package, so there is nothing to copy or configure.
  workletUrl?: string | URL;
}

export interface Synth {
  // Stereo (the mono engine on both channels). Connect it to the destination or any other node.
  readonly output: AudioNode;
  // 336 voice bytes or one voice SysEx message. Throws on anything else and keeps the voice it had.
  // Notes already sounding keep the voice they started with.
  loadVoice(voice: Uint8Array): void;
  // note 0-127, velocity 0-127 (0 is a note-off). Throws on values out of range.
  noteOn(note: number, velocity?: number): void;
  noteOff(note: number): void;
  allNotesOff(): void;
  // All notes off, disconnect, close the port. The synth can't be used afterwards.
  dispose(): void;
}

const modules = new WeakMap<BaseAudioContext, Promise<void>>();

function addWorklet(ctx: BaseAudioContext, url: string | URL | undefined): Promise<void> {
  const loaded = modules.get(ctx);
  if (loaded) return loaded;
  const blobUrl = url ? null : URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
  const p = ctx.audioWorklet.addModule(String(url ?? blobUrl))
    .catch((e: unknown) => { modules.delete(ctx); throw e; }) // a failed load can be retried
    .finally(() => { if (blobUrl) URL.revokeObjectURL(blobUrl); });
  modules.set(ctx, p);
  return p;
}

export async function createSynth(ctx: BaseAudioContext, opts: SynthOptions = {}): Promise<Synth> {
  await addWorklet(ctx, opts.workletUrl);
  const node = new AudioWorkletNode(ctx, PROCESSOR, { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
  let disposed = false;
  const post = (m: ToWorklet): void => {
    if (disposed) throw new Error("This synth has been disposed.");
    node.port.postMessage(m);
  };
  return {
    output: node,
    loadVoice(voice) { post({ type: "patch", data: readVoice(voice) }); }, // checked here, never in the audio thread
    noteOn(note, velocity = 100) {
      const e = noteOnEvent(note, velocity);
      post(e.off ? { type: "noteOff", note } : { type: "noteOn", note, velocity });
    },
    noteOff(note) { post({ type: "noteOff", note: checkNote(note) }); },
    allNotesOff() { post({ type: "allOff" }); },
    dispose() {
      if (disposed) return;
      post({ type: "allOff" });
      disposed = true;
      node.disconnect();
      node.port.close();
    },
  };
}
