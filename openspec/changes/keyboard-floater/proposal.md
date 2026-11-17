# Proposal

## Why

The only way to play notes today is the computer's Z–M keys: one octave, fixed velocity, no touch, and the target is implied (always the VZ over MIDI, plus the emulator when SOUND is on). A floating on-screen keyboard makes voices playable with a pointer or a finger, over a wider range and at chosen velocities, and makes it explicit whether notes go to the emulator, the VZ, or both.

## What Changes

- `lib/play.ts`: one note router for every way of playing (floater, computer keys). It handles:
  - **PLAY TO:** EMULATOR, VZ or BOTH
  - the MIDI channel, and a default velocity
  - **held notes:** counted per key, so two sources holding the same key make one note
  - a held-notes listener for highlighting
- `components/KeyboardFloater.tsx`: a draggable floating panel, toggled by KEYS in the header. It holds:
  - 2 octaves, with OCTAVE − / +
  - VELOCITY
  - PLAY TO
  - pointer and multi-touch play, with glissando (slide across keys)
  - keys lit while held, from any source
  - its position and settings remembered
- **Starting sound:** pressing a key with PLAY TO including the emulator while SOUND is off starts SOUND within that press.
- **Computer keys:** they now follow PLAY TO and use the floater's VELOCITY.

## Non-goals

- MIDI IN from a controller keyboard to the emulator (a later change).
- Sustain pedal, pitch bend, mod wheel.

## Capabilities

### New Capabilities
- `keyboard`: playing notes from the page and where they go.
