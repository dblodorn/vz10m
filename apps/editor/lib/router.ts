// The app's note router: lib/play.ts wired to the VZ (lib/midi.ts) and the emulator (lib/audio.ts).
// Kept apart from play.ts so the router's tests don't load either.

import * as A from "./audio.ts";
import * as M from "./midi.ts";
import { createRouter } from "./play.ts";

export const router = createRouter({
  midiOn: M.noteOn,
  midiOff: M.noteOff,
  emuOn: A.noteOn,
  emuOff: A.noteOff,
  emuReady: A.running,
});
