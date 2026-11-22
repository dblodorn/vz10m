// What each part of the editor is, in terms of the VZ-10M's iPD architecture. Shown by the (?) buttons.
// Written for this editor from the VZ-10M owner's manual (page numbers cited), not quoted from it.
// `editor` notes say where this editor or its emulator departs from the hardware or is still estimated.

export interface Help {
  title: string;
  body: string[];
  manual?: string; // owner's manual pages
  editor?: string;
}

export const HELP = {
  ipd: {
    title: "iPD: MODULES AND LINES",
    body: [
      "A VZ voice is built from 8 modules, M1 to M8. Each module is an oscillator (DCO) followed by its own amplifier (DCA) with an 8-step envelope.",
      "A module's output can be heard, or it can be used to reshape another module's waveform. The modules work in fixed pairs called lines: A is M1+M2, B is M3+M4, C is M5+M6, D is M7+M8.",
      "Each line combines its pair by MIX, RING or PHASE, and a line can also bend the next line's waveform (EXT PHASE). What you hear is the sum of the lines that sound.",
    ],
    manual: "pp.12–15",
  },
  line: {
    title: "LINE: MIX, RING, PHASE",
    body: [
      "The second module of a line always feeds the line's output. The first module either joins it or modulates it:",
      "MIX: M1 + M2. Both oscillators are heard side by side.",
      "RING: M2 + M2 × M1. The product adds sum-and-difference tones: clangy, metallic, bell-like.",
      "PHASE: M2(M1). Only M2 is heard; M1 is used as M2's phase, so M1 reshapes M2's waveform. This is the core of iPD sound shaping.",
      "How strong RING and PHASE are follows the modulating module's DCA, so its envelope, key follow and velocity shape the timbre over time, not the volume.",
    ],
    manual: "pp.12–13",
    editor: "How far a full-level M1 bends M2's phase is an estimate in the emulator until it's measured on the hardware.",
  },
  extPhase: {
    title: "EXT PHASE",
    body: [
      "Lines B, C and D can take the output of the line before them as extra phase for their second module (M4, M6 or M8). For line B with MIX that gives M3 + M4(A); with PHASE, M4(M3 + A).",
      "The line used this way is no longer heard: it becomes a modulator only. Chaining lines lets M1–M7 all shape what finally comes out of M8.",
    ],
    manual: "pp.13–15",
  },
  module: {
    title: "MODULE: DCO + DCA",
    body: [
      "Each module has a DCO (the oscillator: wave and pitch) and a DCA (its amplifier: envelope, depth, key follow, velocity, tremolo).",
      "In a line that MIXes, a module's DCA sets how loud it is. When the module modulates another (RING, PHASE, EXT PHASE), its DCA sets how strongly it changes the other's tone.",
      "ON switches the module on or off; a module that is off adds nothing to the sound.",
    ],
    manual: "pp.12–13, 34",
  },
  wave: {
    title: "WAVE",
    body: [
      "The DCO's waveform. SINE is pure; SAW1 to SAW5 carry progressively more harmonics; NOISE1 is noise, NOISE2 is noise with some of the note's pitch in it.",
      "Through PHASE and RING these simple shapes become far more complex ones, so start simple and let the lines do the work.",
    ],
    manual: "p.34",
    editor: "The emulator makes SAW1–5 by phase distortion; their exact brightness is estimated until compared with the hardware.",
  },
  detune: {
    title: "DETUNE",
    body: [
      "Sets each module's pitch against the played key: up or down (DETUNE +), in octaves and semitones (NOTE) and fine steps of about 1.6 cents (FINE).",
      "Whole-number intervals stack harmonics (an octave, a twelfth); small FINE offsets between modules thicken the sound. Detuning a modulator against its carrier changes the character of RING and PHASE.",
      "PITCH FIX makes the module ignore the key and sound a fixed frequency, from about F#-1 upward, or 4 octaves lower with FIX x1/16. Useful for attack noises and formants that shouldn't follow the keyboard.",
    ],
    manual: "p.35",
  },
  envDepth: {
    title: "ENV DEPTH (DCA)",
    body: [
      "Raises or lowers this module's whole envelope without changing its shape: in effect the module's level. 99 is the full envelope; lower values shift it down.",
      "For a modulator this is a timbre control: it sets how much the module bends the line it feeds.",
    ],
    manual: "p.43",
    editor: "Stored inverted (0 = 99 on the panel); the editor shows the panel value first.",
  },
  ampSens: {
    title: "AMP SENS",
    body: [
      "How strongly this module responds to tremolo, and to envelope bias from aftertouch, the wheels and the foot controller. 0 ignores them, 7 is the strongest.",
      "Different settings per module let tremolo move some modules and not others, for example only the modulators, which turns tremolo into a timbre movement.",
    ],
    manual: "p.47",
  },
  velocity: {
    title: "VELOCITY (DCA)",
    body: [
      "How this module's envelope level follows how hard you play. CURVE picks one of 8 response shapes; SENS sets how much effect it has (0 none, 31 the most).",
      "A soft note shifts the envelope down. On a modulator that means softer playing gives a duller tone, much like an acoustic instrument.",
    ],
    manual: "p.45",
    editor: "The 8 curves are read off the manual's graphs, so they're approximate.",
  },
  dcaEnv: {
    title: "DCA ENVELOPE",
    body: [
      "Eight steps, each a RATE and a LEVEL. The envelope moves toward each step's LEVEL at its RATE, then on to the next step. RATE is a slope, the same for rising and falling: 99 is near-instant, 0 very slow.",
      "SUSTAIN holds the envelope at that step while the key is down; letting go continues from the next step, like an ADSR's release. END is the last step.",
      "VELOCITY RATE marks steps whose rate speeds up with harder playing (set with RATE VEL on the right).",
    ],
    manual: "pp.42, 97",
    editor: "How fast each RATE value moves is estimated until measured.",
  },
  dcaKf: {
    title: "DCA KEY FOLLOW",
    body: [
      "Six points across the keyboard (C0–C9), each a key and a level, that scale this module's envelope by where you play. Between the points the level is interpolated.",
      "Use it to fade a module out toward the top or bottom of the range, or, on a modulator, to make the tone brighter or darker by register.",
    ],
    manual: "p.44",
    editor: "Levels are stored inverted (0 = 99 on the panel).",
  },
  totalLevel: {
    title: "TOTAL LEVEL",
    body: ["The voice's overall level, for all 8 modules: the most it can reach at full volume. 00 is silent, 99 the loudest."],
    manual: "p.48",
  },
  octave: {
    title: "OCTAVE",
    body: ["Moves every module up or down by up to 2 octaves. With OCTAVE at 0 and no detune, the voice plays at standard pitch, A4 = 442 Hz."],
    manual: "p.41",
  },
  pitchEnv: {
    title: "PITCH (DCO) ENVELOPE",
    body: [
      "One 8-step envelope that moves the pitch of all 8 modules over time. Its levels run from −63 to +63, with 0 meaning no change; it has its own SUSTAIN and END steps.",
      "ENV DEPTH (0–63) scales the whole envelope: at 0 it has no effect. WIDE RANGE makes each level step 100 cents (up to about ±5 octaves); off (NARROW), each step is 25 cents for finer, smaller movements.",
    ],
    manual: "pp.36–37",
  },
  pitchVel: {
    title: "PITCH AND RATE VELOCITY",
    body: [
      "PITCH VEL: how much playing harder deepens the pitch envelope. RATE VEL: how much playing harder speeds up the envelope steps marked VELOCITY RATE, in both the pitch and the DCA envelopes.",
      "Each has a CURVE (one of 8 shapes) and a SENS (0 none, 31 the most).",
    ],
    manual: "pp.39, 50",
    editor: "The 8 curves are read off the manual's graphs, so they're approximate.",
  },
  pitchKf: {
    title: "PITCH KEY FOLLOW",
    body: ["Six points across the keyboard that scale the pitch envelope by key: 63 is the full envelope, 0 makes it disappear. Use it to keep a pitch swoop on low notes but not high ones, for example."],
    manual: "p.38",
  },
  rateKf: {
    title: "RATE KEY FOLLOW",
    body: ["Six points across the keyboard that speed up every envelope, pitch and DCA, by key. Where the value is higher the envelopes move faster, so high notes can decay quicker, as on a piano."],
    manual: "p.49",
  },
  vibrato: {
    title: "VIBRATO",
    body: [
      "An LFO that moves the pitch of all modules. WAVE: TRIANGLE swings up and down; SAW UP, SAW DOWN and SQUARE move between the note and a higher pitch (SQUARE is a trill). DEPTH, RATE, and DELAY before it starts.",
      "MULTI on gives each note its own vibrato, starting from its own key press; off keeps every note in step.",
    ],
    manual: "p.40",
    editor: "LFO speeds and depths are estimated until measured.",
  },
  tremolo: {
    title: "TREMOLO",
    body: [
      "An LFO that moves the level of the modules: TRIANGLE pulses, SAW UP rises and cuts off, SAW DOWN swoops down, SQUARE switches on and off. DEPTH, RATE, DELAY and MULTI work as for vibrato.",
      "How much each module takes is its AMP SENS, so tremolo on modulators changes the tone instead of the volume.",
    ],
    manual: "pp.46–47",
    editor: "LFO speeds and depths are estimated until measured.",
  },
  sound: {
    title: "SOUND (EMULATOR)",
    body: [
      "Plays the voice in the browser with an emulation of the VZ's iPD engine: 16 notes, 8 modules each, with lines, envelopes, key follow, velocity and the LFOs. It needs no hardware.",
    ],
    editor: "The structure follows the manual, but several curves (rate speeds, level steps, saw shapes, modulation depth) are estimates until compared with recordings of a VZ-10M. Treat it as VZ-shaped, not yet VZ-exact.",
  },
  keys: {
    title: "KEYS",
    body: [
      "A floating two-octave keyboard. PLAY TO sends notes to the emulator, the VZ over MIDI, or both; VELOCITY lets you hear the velocity settings. The Z–M computer keys follow the same PLAY TO.",
    ],
  },
  midi: {
    title: "MIDI AND SYSEX",
    body: [
      "Voices travel between the VZ-10M and the editor as System Exclusive messages. On the VZ, MENU 3-04 EXCLUSIVE must be ENA, and MENU 3-03 RECEIVE CH must match CHANNEL here.",
      "Selecting a sound on the VZ (NORMAL or COMBI play) sends it here. A voice sent from here lands in the VZ's compare/recall area: press WRITE on the VZ to keep it.",
    ],
    manual: "pp.73–75, 89",
  },
  library: {
    title: "LIBRARY",
    body: [
      "LOCAL: voices and operations kept in this browser. IMPORT and EXPORT .SYX move them between machines and other editors; SEND puts one in the VZ's compare/recall area.",
      "SHARED: a public list anyone can open. SHARE CURRENT adds the voice you're editing. Voices marked YOURS were shared from this browser, and only it can rename, update or delete them, using a device key kept here (no account). Copy the key under DEVICE KEY to manage them from another browser.",
      "BANKS: sets of 64 voices kept on this device. PUT CURRENT fills a slot; ADD TO BANK in LOCAL and SHARED fills the chosen bank's first empty slot. EXPORT .SYX writes the filled slots as one file.",
      "COLOPHON: the typeface (Knif Mono, by A is for fonts), then the owner's manual, patch archives and old VZ tools elsewhere on the web. Most archives hold whole-bank dumps, which IMPORT .SYX doesn't read yet; Casio's RC-100 to RC-140 ROM card voices are already in SHARED.",
    ],
    editor: "The VZ's own bank transfer (MENU 3-02) has no documented byte format, so a bank can't be sent into the VZ's memory from here; send its voices one at a time with SEND.",
  },
} satisfies Record<string, Help>;

export type HelpKey = keyof typeof HELP;
