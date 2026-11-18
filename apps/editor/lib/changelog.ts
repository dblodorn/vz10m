// What changed, for /changelog. Newest first: add each shipped feature, fix or enhancement at the top,
// one short line about what a player sees, hears or can do. Same-day entries stay in the order written.

// each type's badge fill: Sanzo Wada combination 225 (https://sanzo-wada.dmbk.io/combination/225), every color
// at least 5.3:1 against the badge's white text
export interface ChangeType { name: string; slug: string; hex: string }
export type ChangeKind = "FEATURE" | "ENHANCEMENT" | "FIX";
export interface Change { date: string; type: ChangeKind; text: string }

export const TYPES: Record<ChangeKind, ChangeType> = {
  FEATURE: { name: "DUSKY GREEN", slug: "dusky-green", hex: "#00592e" },
  ENHANCEMENT: { name: "DARK SLATE PURPLE", slug: "dark-slate-purple", hex: "#53225c" },
  FIX: { name: "CARMINE", slug: "carmine", hex: "#d60036" },
};

export const CHANGELOG: Change[] = [
  { date: "2026-11-18", type: "ENHANCEMENT", text: "SOUND plays through the VZ engine package (@dblodorn/casio-vz-engine), the same emulator other apps can now use." },
  { date: "2026-11-17", type: "FEATURE", text: "LIBRARY → BANKS: build banks of 64 voices on this device, and export them as .syx." },
  { date: "2026-11-17", type: "FEATURE", text: "LIBRARY → SHARED: share voices in a public list, open anyone's, and rename, update or delete your own. No account needed." },
  { date: "2026-11-17", type: "FEATURE", text: "(?) buttons explain each part of the editor in terms of the VZ's iPD architecture, citing the owner's manual." },
  { date: "2026-11-17", type: "FIX", text: "A line used as EXT PHASE is no longer heard in the emulator, as on the VZ." },
  { date: "2026-11-17", type: "FEATURE", text: "KEYS: a floating two-octave keyboard to play the emulator, the VZ, or both, with OCTAVE and VELOCITY." },
  { date: "2026-11-17", type: "FEATURE", text: "AUDIO: choose which audio device the emulator plays through." },
  { date: "2026-11-17", type: "FEATURE", text: "SOUND plays the pitch envelope, vibrato, tremolo, key follow, velocity, ENV DEPTH and TOTAL LEVEL." },
  { date: "2026-11-17", type: "FIX", text: "FIX RANGE is x1/16 (it was shown as x16); ENV DEPTH and DCA KF LEVEL show their panel values; INIT starts at full level." },
  { date: "2026-11-17", type: "FEATURE", text: "SOUND plays the lines: MIX, PHASE and RING, and EXT PHASE from the line before." },
  { date: "2026-11-17", type: "FEATURE", text: "SOUND plays every wave (SINE, SAW1–5, NOISE1–2) with each module's detune, fixed pitch and the voice's octave." },
  { date: "2026-11-17", type: "FEATURE", text: "SOUND: hear the voice in the browser, without the VZ. An early emulator: every module plays a sine through its envelope." },
  { date: "2026-11-17", type: "FEATURE", text: "Library: save voices in the browser, import and export .syx files." },
  { date: "2026-11-17", type: "FEATURE", text: "Voice editor: lines, modules, 8-step envelopes, key follow, vibrato and tremolo." },
  { date: "2026-11-17", type: "FEATURE", text: "MIDI: receive voices from the VZ-10M and send them back as SysEx." },
];
