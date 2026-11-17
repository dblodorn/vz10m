# Design

## Bytes are the source of truth

A voice is held as its 336 decoded bytes (an operation as 100). Fields are read and written through `lib/vz/params.ts`: key, byte, mask, range. Every edit writes only that field's bits, so bits this editor doesn't model (unused bytes 334–335, the low bits of byte 173, anything misdocumented) come back unchanged. A decode → encode of a dump is byte-for-byte identical, and the tests check this for every field and every fixture.

This is also the storage shape for milestone 3. The API stores the bytes (base64) plus derived params for search, so fixing a field's documentation later never invalidates saved data.

## Sources and confidence

| Fact | Source | Status |
|---|---|---|
| Header `F0 44 03 00 7n TT II`, `TT` 00 voice / 01 operation, `II` 40 | riban vzsysex.cpp/vzvoice.cpp/vzoperation.cpp; VZ-8M manual p.120 (operation header, "common to VZ-1/10M") | confirmed by a real dump |
| Payload nibbles high-first, 672 (voice) / 200 (operation) | riban vzsysex.cpp | confirmed by a real dump |
| Checksum `-(Σ data bytes) & 0x7F` | riban vzsysex.cpp | confirmed by a real dump |
| Voice name at 322–333 | riban notes | confirmed by a real dump |
| Voice field layout | riban "VZ sound creation.txt" + vzvoice.cpp | structure plausible on a real dump; not checked against the hardware |
| Operation field layout | riban "VZ operation creation.txt" | not checked; riban's code for it uses wrong offsets |
| No dump-request message on the VZ-10M | VZ-10M owner's manual p.89, SysEx message table (the VZ-8M's request is VZ-8M only) | confirmed (manual) |
| Selecting a sound in NORMAL/COMBI play transmits it; it is received into the compare/recall area | VZ-10M manual p.89 note *1 | confirmed (manual) |
| Operation data is sent and received only in OP MEM mode | VZ-10M manual p.89 table, note *2 | confirmed (manual) |
| Transmit/receive needs MENU 3-04 EXCLUSIVE=ENA and matching basic channels (MENU 3-03; separate RECEIVE and SEND) | VZ-10M manual pp.73–75, 89 | confirmed (manual) |
| Multi-channel mode data (type `02`?) | VZ-10M manual p.89 lists the message; riban names type 2 | **format unknown**, not implemented |
| Bulk SAVE/LOAD (64 sounds and/or 64 operations), started from MENU 3-02 | VZ-10M manual p.73, p.89 | exists; **byte format unknown**. riban's `70`–`74` handshake is a stub, and the manual points to a separate "MIDI implementation chart" not in the PDF |

Where riban's notes and code disagree, the notes win and the field is marked `unverified` in `params.ts`:
- external phase bit order (byte 0)
- key-follow offsets: the code advances by 1 per step instead of 2
- DCO envelope depth: 183 in the notes, 182 in one setter
- the end-step encoding (0–7 taken as a step index)

## Receiving

The VZ-10M has no dump-request message (owner's manual p.89), so the editor never asks for voices. With EXCLUSIVE=ENA, selecting a sound on the VZ transmits it, and anything arriving on the chosen MIDI IN is parsed:
- A voice replaces the current one and can be undone.
- An operation goes to the library.
- A damaged dump is reported and dropped.

## Sending

The editor sends a whole voice to area `40` on the chosen channel, either from SEND or 250 ms after the last edit when SEND ON EDIT is on. Library sends are paced 150 ms apart. The gap is a cautious guess and should be measured on the hardware.

## UI

The UI copies windchime's components and rules unchanged. `Editor.jsx` is the one client root. `Library.jsx` loads through `next/dynamic` the first time LIBRARY is pressed. Storage and Web MIDI support are read in a mount effect so the server render matches.

## Risks

- **Display scales:** the VZ panel shows several values on a 0–99 scale, and the stored ranges are 0–127 or 0–63. The editor shows raw values (LEVEL also shows its stated 99–0 inversion) until the conversions are confirmed on the hardware.
- **INIT voice:** it is this editor's own guess at a playable starting point, not Casio's initial voice.
