// One table per data type: every editable field, where it lives in the decoded bytes, and its range.
// The codec reads and writes through these entries, and the editor and schema are generated from them.
// Fields not listed keep whatever bits the synth sent, so a decode -> edit -> encode round trip is lossless.
//
// Source: riban-bw/vzeditor "VZ sound creation.txt" / "VZ operation creation.txt" (bit letters A-H, A = MSB),
// cross-checked against its vzvoice.cpp / vzoperation.cpp accessors. Where the two disagree the notes win and
// the field is marked `unverified` until checked against a dump from the hardware.
//
// Values are raw stored values. Several are shown on the VZ panel through a conversion (for example LEVEL is
// stored inverted, 0x00-0x7F = 99-0); conversions live in `display` and are only given where the source states them.

const A = 0x80, B = 0x40, C = 0x20, D = 0x10, E = 0x08, F = 0x04, G = 0x02, H = 0x01;

export const WAVEFORMS = ["SINE", "SAW1", "SAW2", "SAW3", "SAW4", "SAW5", "NOISE1", "NOISE2"] as const;
export const LINE_MODES = ["MIX", "PHASE", "RING"] as const;
export const LFO_WAVES = ["TRIANGLE", "SAW UP", "SAW DOWN", "SQUARE"] as const;
export const LINES = ["A", "B", "C", "D"] as const;
export type Line = (typeof LINES)[number];

export interface Field {
  key: string;
  byte: number;
  mask: number;
  shift: number;
  min: number;
  max: number;
  label: string;
  options?: readonly string[];
  unverified?: boolean;
  // stored value -> what the VZ panel shows, only where a source states the conversion
  display?: (v: number) => number;
}
type Extra = Partial<Omit<Field, "key" | "byte" | "mask" | "shift">> & { label: string };

const shiftOf = (mask: number): number => { let s = 0; while (!(mask & (1 << s))) s++; return s; };

function field(key: string, byte: number, mask: number, extra: Extra): Field {
  const shift = shiftOf(mask);
  return { key, byte, mask, shift, min: 0, max: mask >> shift, ...extra };
}

// ---------- voice (336 bytes) ----------

// TOTAL LEVEL, ENV DEPTH (DCA) and KF LEVEL (DCA) are stored inverted: 0x00-0x7F = 99-0 on the panel
// (riban's notes, footnote 5, shared by all three)
const inverted = (v: number): number => 99 - Math.round((v * 99) / 127);

function voiceFields(): Field[] {
  const f: Field[] = [];
  // byte 0: external phase (the previous line phase-modulates M4 / M6 / M8)
  f.push(field("m4.extPhase", 0, F, { label: "EXT PHASE", unverified: true }));
  f.push(field("m6.extPhase", 0, G, { label: "EXT PHASE", unverified: true }));
  f.push(field("m8.extPhase", 0, H, { label: "EXT PHASE", unverified: true }));
  for (let l = 0; l < 4; l++) {
    const byte = 1 + l, m1 = l * 2 + 1, m2 = l * 2 + 2;
    f.push(field(`line${LINES[l]}.mode`, byte, A | B, { label: "LINE", max: 2, options: LINE_MODES }));
    f.push(field(`m${m2}.wave`, byte, C | D | E, { label: "WAVE", options: WAVEFORMS }));
    f.push(field(`m${m1}.wave`, byte, F | G | H, { label: "WAVE", options: WAVEFORMS }));
  }
  for (let m = 1; m <= 8; m++) {
    const b = 5 + (m - 1) * 2;
    f.push(field(`m${m}.fine`, b, 0xfc, { label: "FINE" }));
    f.push(field(`m${m}.fix`, b, G, { label: "PITCH FIX" }));
    f.push(field(`m${m}.fixRange`, b, H, { label: "FIX x1/16" })); // manual p.35: RANGE x1 / x1/16
    f.push(field(`m${m}.detunePlus`, b + 1, A, { label: "DETUNE +" }));
    f.push(field(`m${m}.note`, b + 1, 0x7f, { label: "NOTE" }));
  }
  // envelopes: 8 steps, 18 bytes per step: 8 module rates, DCO rate, 8 module levels, DCO level
  for (let s = 1; s <= 8; s++) {
    const base = 21 + (s - 1) * 18;
    for (let m = 1; m <= 8; m++) {
      f.push(field(`m${m}.env${s}.rate`, base + m - 1, 0x7f, { label: "RATE" }));
      f.push(field(`m${m}.env${s}.velRate`, base + m - 1, A, { label: "VEL RATE" }));
      f.push(field(`m${m}.env${s}.level`, base + 9 + m - 1, 0x7f, { label: "LEVEL" }));
      f.push(field(`m${m}.env${s}.sustain`, base + 9 + m - 1, A, { label: "SUSTAIN" }));
    }
    f.push(field(`dco.env${s}.rate`, base + 8, 0x7f, { label: "RATE" }));
    f.push(field(`dco.env${s}.velRate`, base + 8, A, { label: "VEL RATE" }));
    f.push(field(`dco.env${s}.level`, base + 17, 0x7f, { label: "LEVEL" }));
    f.push(field(`dco.env${s}.sustain`, base + 17, A, { label: "SUSTAIN" }));
  }
  for (let m = 1; m <= 8; m++) {
    f.push(field(`m${m}.envEnd`, 165 + m - 1, B | C | D, { label: "END STEP" }));
    f.push(field(`m${m}.ampSens`, 165 + m - 1, F | G | H, { label: "AMP SENS" }));
  }
  f.push(field("dco.envEnd", 173, B | C | D, { label: "END STEP" }));
  f.push(field("level", 174, 0x7f, { label: "LEVEL", display: inverted }));
  for (let m = 1; m <= 8; m++) {
    f.push(field(`m${m}.off`, 175 + m - 1, A, { label: "MODULE OFF" }));
    f.push(field(`m${m}.envDepth`, 175 + m - 1, 0x7f, { label: "ENV DEPTH", display: inverted }));
  }
  f.push(field("dco.range", 183, A, { label: "WIDE RANGE" }));
  f.push(field("dco.envDepth", 183, 0x3f, { label: "ENV DEPTH" }));
  // key follow: 6 steps of (key, level) per module, 12 bytes each
  for (let m = 1; m <= 8; m++) {
    for (let s = 1; s <= 6; s++) {
      const b = 184 + (m - 1) * 12 + (s - 1) * 2;
      f.push(field(`m${m}.kf${s}.key`, b, 0x7f, { label: "KEY", max: 0x78 }));
      f.push(field(`m${m}.kf${s}.level`, b + 1, 0x7f, { label: "LEVEL", display: inverted }));
    }
  }
  for (let s = 1; s <= 6; s++) {
    f.push(field(`dco.kf${s}.key`, 280 + (s - 1) * 2, 0x7f, { label: "KEY", max: 0x78 }));
    f.push(field(`dco.kf${s}.level`, 281 + (s - 1) * 2, 0x3f, { label: "LEVEL" }));
    f.push(field(`rate.kf${s}.key`, 292 + (s - 1) * 2, 0x7f, { label: "KEY", max: 0x78 }));
    f.push(field(`rate.kf${s}.rate`, 293 + (s - 1) * 2, 0x7f, { label: "RATE" }));
  }
  for (let m = 1; m <= 8; m++) {
    f.push(field(`m${m}.velCurve`, 304 + m - 1, A | B | C, { label: "VEL CURVE" }));
    f.push(field(`m${m}.velSens`, 304 + m - 1, 0x1f, { label: "VEL SENS" }));
  }
  f.push(field("dco.velCurve", 312, A | B | C, { label: "VEL CURVE" }));
  f.push(field("dco.velSens", 312, 0x1f, { label: "VEL SENS" }));
  f.push(field("rate.velCurve", 313, A | B | C, { label: "VEL CURVE" }));
  f.push(field("rate.velSens", 313, 0x1f, { label: "VEL SENS" }));
  f.push(field("octavePlus", 314, A, { label: "OCTAVE +" }));
  f.push(field("octave", 314, B | C, { label: "OCTAVE" }));
  f.push(field("vib.multi", 314, E, { label: "MULTI" }));
  f.push(field("vib.wave", 314, G | H, { label: "WAVE", options: LFO_WAVES }));
  f.push(field("vib.depth", 315, 0x7f, { label: "DEPTH" }));
  f.push(field("vib.rate", 316, 0x7f, { label: "RATE" }));
  f.push(field("vib.delay", 317, 0x7f, { label: "DELAY" }));
  f.push(field("trem.multi", 318, E, { label: "MULTI" }));
  f.push(field("trem.wave", 318, G | H, { label: "WAVE", options: LFO_WAVES }));
  f.push(field("trem.depth", 319, 0x7f, { label: "DEPTH" }));
  f.push(field("trem.rate", 320, 0x7f, { label: "RATE" }));
  f.push(field("trem.delay", 321, 0x7f, { label: "DELAY" }));
  return f;
}

// ---------- operation (100 bytes) ----------

const CONTROLLERS: [string, number][] = [["at", 32], ["wheel1", 34], ["wheel2", 36], ["foot", 38]];
const CONTROL_TARGETS: [string, number][] = [["envBias", A], ["tremRate", B], ["tremDepth", C], ["portaTime", D], ["pitchDown", E], ["pitchUp", F], ["vibRate", G], ["vibDepth", H]];

function operationFields(): Field[] {
  const f: Field[] = [];
  f.push(field("mode", 0, 0x0f, { label: "MODE", unverified: true }));
  f.push(field("crossfade", 15, G, { label: "POSITIONAL XFADE" }));
  f.push(field("split1", 16, 0x7f, { label: "SPLIT", min: 0x0c, max: 0x78 }));
  ["splitLow", "splitMid", "splitHigh"].forEach((k, i) => f.push(field(k, 17 + i, 0x7f, { label: "SPLIT", min: 0x0c, max: 0x78 })));
  ["xf2Min", "xf2Max", "xf4LowMin", "xf4LowMax", "xf4MidMin", "xf4MidMax", "xf4HighMin", "xf4HighMax"]
    .forEach((k, i) => f.push(field(k, 20 + i, 0x7f, { label: "XFADE", min: 0x0c, max: 0x78 })));
  for (let c = 1; c <= 4; c++) {
    const b = 28 + (c - 1) * 18, p = `c${c}.`;
    f.push(field(p + "card", b, B, { label: "CARD" }));
    f.push(field(p + "voice", b, 0x3f, { label: "VOICE" }));
    f.push(field(p + "tremInv", b + 1, A, { label: "TREM INVERSE" }));
    f.push(field(p + "vibInv", b + 1, B, { label: "VIB INVERSE" }));
    f.push(field(p + "velInv", b + 1, C, { label: "VEL INVERSE" }));
    f.push(field(p + "sustain", b + 1, D, { label: "SUSTAIN PEDAL" }));
    f.push(field(p + "solo", b + 1, E, { label: "SOLO" }));
    f.push(field(p + "portaRate", b + 2, A, { label: "PORTA RATE MODE" }));
    f.push(field(p + "portaTime", b + 2, 0x7f, { label: "PORTA TIME", max: 99 }));
    f.push(field(p + "bendRelease", b + 3, A, { label: "BEND RELEASE" }));
    f.push(field(p + "bendRange", b + 3, 0x3f, { label: "BEND RANGE", max: 48 }));
    for (const [ctl, off] of CONTROLLERS) {
      f.push(field(`${p}${ctl}.plus`, b + off - 28, A, { label: "SENS +" }));
      f.push(field(`${p}${ctl}.sens`, b + off - 28, 0x7f, { label: "SENS", max: 99 }));
      for (const [t, bit] of CONTROL_TARGETS) f.push(field(`${p}${ctl}.${t}`, b + off - 27, bit, { label: t }));
    }
    f.push(field(p + "level", b + 12, 0x7f, { label: "LEVEL", max: 99 }));
    f.push(field(p + "fine", b + 13, 0xfc, { label: "FINE" }));
    f.push(field(p + "notePlus", b + 14, A, { label: "NOTE +" }));
    f.push(field(p + "note", b + 14, 0x7f, { label: "NOTE", max: 71 }));
    f.push(field(p + "velMin", b + 15, 0x7f, { label: "VEL MIN" }));
    f.push(field(p + "velMax", b + 16, 0x7f, { label: "VEL MAX" }));
    f.push(field(p + "delay", b + 17, 0x7f, { label: "DELAY", max: 99 }));
  }
  return f;
}

export const VOICE_FIELDS = voiceFields();
export const OPERATION_FIELDS = operationFields();
export interface NameSlot { offset: number; length: number }
export const VOICE_NAME: NameSlot = { offset: 322, length: 12 };
export const OPERATION_NAME: NameSlot = { offset: 1, length: 12 };

const index = (list: Field[]): Record<string, Field> => Object.fromEntries(list.map(f => [f.key, f]));
export const VOICE_FIELD = index(VOICE_FIELDS);
export const OPERATION_FIELD = index(OPERATION_FIELDS);

// Look up a field the UI knows exists; an unknown key is a programming error, so it throws.
export function voiceField(key: string): Field {
  const f = VOICE_FIELD[key];
  if (!f) throw new Error(`Unknown voice parameter ${key}.`);
  return f;
}
