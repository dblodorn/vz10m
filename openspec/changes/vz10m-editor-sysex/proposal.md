# Proposal

## Why

The Casio VZ-10M is a 1U rack module with a two-line display. Editing its iPD voices (8 modules, 4 lines, 8-step envelopes on every module) through the front panel is slow. The existing editors are desktop-only (riban-bw/vzeditor: C++/wxWidgets, operation editor unfinished), commercial (MidiQuest), or need Ableton Live (VZetta). A browser editor on the same stack as windchime makes voices editable on any computer with Chrome, and is the base for the emulator (milestone 2) and for saving to the dmbk GraphQL API (milestone 3).

## What Changes

- New Next.js 15 app at `~/Desktop/sound/vz10m`, plain JS. It copies windchime's UI exactly: the 1-bit theme, Knif Mono, the restyled shadcn components, `LABEL ..... value` rows, and the changelog page.
- `lib/vz/`: a pure, Node-testable codec for VZ-1/VZ-10M SysEx. It covers framing, nibbles, the checksum, a field table for all 336 voice bytes and 100 operation bytes, and `.syx` split/join.
- `lib/midi.js`: windchime's port lifecycle extended with an input port, SysEx receive and paced SysEx send.
- The editor: the four lines and their modules, the selected module (wave, detune, DCA envelope, key follow, velocity), and the voice-wide settings (level, octave, pitch envelope, key follow, vibrato, tremolo). Undo and redo, SEND, SEND ON EDIT, and auditioning from the computer keyboard.
- A local library (localStorage) with `.syx` import and export.

## Non-goals (this change)

- Browser sound (milestone 2).
- Saving to MongoDB through the GraphQL API (milestone 3).
- Bulk 64-voice transfers and dump requests. Their message format isn't verified yet (see `design.md`).
- A dedicated operation editor UI. Operations are decoded, stored and sent, but not edited field by field.

## Capabilities

### New Capabilities
- `vz-sysex`: the VZ-1/VZ-10M SysEx format, its sources, and what is still unverified.
- `midi-io`: connecting, choosing ports, and receiving and sending dumps.
- `voice-editor`: editing a voice's parameters, undo, sending.
- `library`: keeping voices and operations in the browser and moving them as `.syx` files.
