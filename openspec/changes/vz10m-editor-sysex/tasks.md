# Tasks

## 1. Scaffold

- [x] 1.1 Create `vz10m` from windchime's config, theme, font, `components/ui/*`, changelog page and OpenSpec skills; `git init`; `openspec init --tools claude,agents`. Verify: `pnpm build` passes.

## 2. Format (Phase 0)

- [x] 2.1 Collect the format from riban-bw/vzeditor and the VZ-8M manual; record sources and confidence in `design.md` and `specs/vz-sysex`.
- [x] 2.2 `lib/vz/sysex.js`, `params.js`, `codec.js`. Verify: `pnpm test` passes; riban's KILLER ORGAN dump decodes and re-encodes byte for byte.
- [ ] 2.3 Capture dumps from the VZ-10M into `fixtures/`: an internal voice, a hand-edited voice (one known change per field group), and an operation. Verify: `pnpm test` round-trips each fixture.
- [ ] 2.4 Check every `unverified` field in `params.js` against the hardware (change it on the VZ, dump, diff); clear the flag or fix the entry.
- [x] 2.5 Read the VZ-10M owner's manual MIDI pages (pp.73–75, 89). Result: no dump-request message exists; a voice is sent by selecting it on the VZ; operations only in OP MEM mode. Recorded in `design.md`.
- [ ] 2.6 Bulk SAVE/LOAD format (MENU 3-02 → MIDI): the manual has no byte table. Capture a full 64-voice SAVE from the VZ as raw bytes (a MIDI monitor, or a raw-capture mode in this editor), work out the framing from it, then implement receive and send.
- [ ] 2.7 Find the separate "MIDI implementation chart" the manual refers to, which should hold the byte formats.

## 3. MIDI

- [x] 3.1 `lib/midi.js`: SysEx access on a click, IN and OUT ports that survive replugging, VZ dump parsing, paced send, notes, PANIC. Verify: stubbed-MIDI browser check receives a voice and sends 681 bytes.
- [ ] 3.2 Hardware: send a voice to the VZ-10M and hear the change; measure the shortest safe gap between dumps.

## 4. Editor and library

- [x] 4.1 Lines and modules, module panel, envelope editor, key follow, voice panel, undo/redo, SEND ON EDIT, computer-keyboard audition. Verify: stubbed check: edit → send changes only the edited bits; undo restores the received voice exactly.
- [x] 4.2 Library: save, open, send, delete (confirm), search, `.syx` import/export. Verify: the saved voice survives a reload.
- [x] 4.3 No hydration warnings; no horizontal scroll at 390 px. Verify: stubbed check reports no console errors and no overflow.
- [ ] 4.4 Show panel-scale values once 2.4 confirms the conversions.
