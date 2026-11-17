// What changed, for /changelog. Newest first: add each shipped feature, fix or enhancement at the top,
// one short line about what a player sees, hears or can do. Same-day entries stay in the order written.

// each type's badge fill: Sanzo Wada combination 225 (https://sanzo-wada.dmbk.io/combination/225), every color
// at least 5.3:1 against the badge's white text
export const TYPES = {
  FEATURE: { name: "DUSKY GREEN", slug: "dusky-green", hex: "#00592e" },
  ENHANCEMENT: { name: "DARK SLATE PURPLE", slug: "dark-slate-purple", hex: "#53225c" },
  FIX: { name: "CARMINE", slug: "carmine", hex: "#d60036" },
};

export const CHANGELOG = [
  { date: "2026-11-17", type: "FEATURE", text: "Library: save voices in the browser, import and export .syx files." },
  { date: "2026-11-17", type: "FEATURE", text: "Voice editor: lines, modules, 8-step envelopes, key follow, vibrato and tremolo." },
  { date: "2026-11-17", type: "FEATURE", text: "MIDI: receive voices from the VZ-10M and send them back as SysEx." },
];
