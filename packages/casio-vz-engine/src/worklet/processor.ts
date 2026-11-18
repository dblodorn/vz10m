// The emulator in the audio thread: one Engine, fed by port messages from the synth on the main thread.
// Bundled with the engine by esbuild (pnpm build:worklet) into dist/worklet.js and src/worklet/code.generated.ts.

import { Engine } from "../engine/engine.ts";
import { toPatch } from "../engine/patch.ts";
import { PROCESSOR, type ToWorklet } from "./messages.ts";

class VzProcessor extends AudioWorkletProcessor {
  private readonly engine = new Engine(sampleRate);

  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent<ToWorklet>) => {
      const m = e.data;
      if (m.type === "patch") this.engine.setPatch(toPatch(m.data)); // converted here, once, not per sample
      else if (m.type === "noteOn") this.engine.noteOn(m.note, m.velocity);
      else if (m.type === "noteOff") this.engine.noteOff(m.note);
      else this.engine.allOff();
    };
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const out = outputs[0];
    const first = out?.[0];
    if (!out || !first) return true;
    first.fill(0);
    this.engine.render(first, first.length);
    for (let c = 1; c < out.length; c++) out[c]!.set(first); // mono engine, same signal on every channel
    return true;
  }
}

registerProcessor(PROCESSOR, VzProcessor);
