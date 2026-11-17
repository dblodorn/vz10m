// One note router for every way of playing from the page (the keyboard floater, the computer keys).
// PLAY TO picks the destination: the emulator, the VZ over MIDI, or both. Keys are counted per source, so two
// sources holding the same key make one note that ends when the last lets go.
// The outputs are injected so the router runs in Node tests; `router` below is the app's instance.

export type Target = "emulator" | "vz" | "both";
export const TARGETS: { value: Target; label: string }[] = [
  { value: "emulator", label: "EMULATOR" },
  { value: "vz", label: "VZ" },
  { value: "both", label: "BOTH" },
];

export interface Outputs {
  midiOn(channel: number, note: number, velocity: number): void;
  midiOff(channel: number, note: number): void;
  emuOn(note: number, velocity: number): void;
  emuOff(note: number): void;
  emuReady(): boolean; // the emulator is running (SOUND on)
}

export interface Router {
  noteOn(note: number, velocity?: number): void;
  noteOff(note: number): void;
  allOff(): void;
  setTarget(t: Target): void;
  setChannel(ch: number): void;
  setVelocity(v: number): void;
  readonly target: Target;
  readonly velocity: number;
  held(): ReadonlySet<number>;
  onHeld(fn: () => void): () => void;
}

export function createRouter(out: Outputs): Router {
  let target: Target = "both", channel = 1, velocity = 100;
  const holds = new Map<number, number>(); // note -> how many sources hold it
  const sent = new Map<number, { midi: boolean; emu: boolean; channel: number }>(); // where each sounding note went
  const listeners = new Set<() => void>();
  let heldView: ReadonlySet<number> = new Set();
  const emit = () => { heldView = new Set(holds.keys()); listeners.forEach(fn => fn()); };

  function end(note: number): void {
    const s = sent.get(note);
    if (s) {
      if (s.midi) out.midiOff(s.channel, note);
      if (s.emu) out.emuOff(note);
      sent.delete(note);
    }
  }

  const router: Router = {
    noteOn(note, vel = velocity) {
      const n = holds.get(note) ?? 0;
      holds.set(note, n + 1);
      if (n === 0) {
        const v = Math.max(1, Math.min(127, Math.round(vel)));
        const midi = target !== "emulator", emu = target !== "vz" && out.emuReady();
        if (midi) out.midiOn(channel, note, v);
        if (emu) out.emuOn(note, v);
        sent.set(note, { midi, emu, channel });
      }
      emit();
    },
    noteOff(note) {
      const n = holds.get(note) ?? 0;
      if (n === 0) return;
      if (n > 1) { holds.set(note, n - 1); return; }
      holds.delete(note);
      end(note);
      emit();
    },
    allOff() {
      if (!holds.size && !sent.size) return;
      for (const note of [...sent.keys()]) end(note);
      holds.clear();
      emit();
    },
    // changing where notes go ends the ones already held, so nothing is stuck on the old destination
    setTarget(t) { if (t !== target) { router.allOff(); target = t; } },
    setChannel(ch) { const c = Math.max(1, Math.min(16, ch | 0)); if (c !== channel) { router.allOff(); channel = c; } },
    setVelocity(v) { velocity = Math.max(1, Math.min(127, Math.round(v))); },
    get target() { return target; },
    get velocity() { return velocity; },
    held: () => heldView,
    onHeld(fn) { listeners.add(fn); return () => { listeners.delete(fn); }; },
  };
  return router;
}
