// LIBRARY → COLOPHON, after the typeface and the design system: ABOUT, then PRIOR WORK (every project, analysis or
// reference the code or the sound draws on, credited even where no code was copied; a change that adds a source adds
// its entry), then RESOURCES: outside pages about the VZ-1 / VZ-10M, newest finds last. Free sources only; each line
// says what's there in terms a player can act on. Bulk dumps (a whole bank in one .syx) aren't read by IMPORT .SYX
// yet; the Casio RC-100 to RC-140 ROM cards are already in SHARED.

export interface Resource { name: string; url: string; text: string }

export const ABOUT =
  "An editor and librarian for the VZ-10M, and a way to learn how iPD synthesis works. The emulator that plays with SOUND is an approximate stand-in for the instrument, written from the owner's manual with several curves estimated, not a replacement for it: the hardware is the reference.";

export const PRIOR_WORK: Resource[] = [
  {
    name: "VZEDITOR (RIBAN)",
    url: "https://github.com/riban-bw/vzeditor",
    text: "riban's open VZ-1 editor (LGPL-3.0): the reference for the SysEx header and how voice and operation data are laid out.",
  },
];

export const RESOURCES: Resource[] = [
  {
    name: "VZ-10M OWNER'S MANUAL",
    url: "https://static.wikitide.net/circuitbendingwiki/a/ad/Casio_VZ10M_Owners_Manual.pdf",
    text: "A scan of the manual (PDF). The (?) notes cite its pages.",
  },
  {
    name: "SOUNDPROGRAMMING.NET",
    url: "https://soundprogramming.net/synthesizers/casio/casio-vz-1/",
    text: "The VZ-1 manual and service manual, and a zip of bank dumps: Casio's RC-100 to RC-520G ROM cards and player banks.",
  },
  {
    name: "GEARSPACE: CASIO VZ LOVE",
    url: "https://gearspace.com/board/electronic-music-instruments-and-electronic-music-production/1359494-casio-vz-love-just-scored-complete-box-example.html",
    text: "Forum thread with the factory voice and operation data as SysEx (attachment; may need a login).",
  },
  {
    name: "SYNTHZONE: CASIO",
    url: "http://www.synthzone.com/casio.htm",
    text: "Old link list for Casio synths, with what remains of the EZ-VZ patch archive.",
  },
  {
    name: "CZ-VZ FILES GROUP ARCHIVE",
    url: "https://synth-diy.org/yg-archives2/group/CZ-VZ-Files/thread/377/",
    text: "The Yahoo group's messages, mirrored: patch sharing and dump-loading tips from VZ owners.",
  },
  {
    name: "CASIO VZ DOS PROGRAMS",
    url: "https://github.com/TobiasVanDyk/Casio-VZ-DOS-Programs",
    text: "DOS-era VZ-10M librarian, voice editor and MIDI dump tools, with their patch files (GPL-3.0).",
  },
];
