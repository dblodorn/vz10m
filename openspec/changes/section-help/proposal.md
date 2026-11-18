# Proposal

## Why

The editor exposes every VZ-10M voice parameter, but the iPD architecture behind them (modules, lines, MIX / RING / PHASE, external phase, rate-based envelopes, key follow) isn't obvious from the controls. Short explanations next to each section, grounded in the owner's manual, make the editor usable without the manual open.

## What Changes

- `lib/help.ts`: one entry per section (23 in all), written for this editor from the VZ-10M owner's manual and citing its pages. An "in this editor" note marks where the emulator relies on estimates.
- `components/Info.tsx`: a 16 px (?) button that opens a 1-bit popover with that entry. `Param`, `Check` and `FieldRow` take an `info` prop, which puts the button after the label.
- **Placement:**
  - LINES
  - each LINE and EXT PHASE
  - MODULE, WAVE, DETUNE, ENV DEPTH, AMP SENS, VEL CURVE, DCA ENVELOPE, DCA KEY FOLLOW
  - TOTAL LEVEL, OCTAVE, PITCH ENVELOPE, PITCH VEL, PITCH and RATE KEY FOLLOW, VIBRATO, TREMOLO
  - SOUND, plus the MIDI dialog, the LIBRARY sheet and the KEYS floater
- **Engine fix found while reading the manual:** a line used as EXT PHASE is no longer heard (manual p.13). The emulator was adding it to the output.

## Capabilities

### New Capabilities
- `help`: in-context explanations of the editor's sections.
