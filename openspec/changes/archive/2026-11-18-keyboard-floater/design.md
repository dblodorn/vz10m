# Design

## One router

`lib/play.ts` is created with its two outputs injected (`createRouter({ midiOn, midiOff, emuOn, emuOff })`), so tests can drive it in Node. The app's instance is wired to `lib/midi.ts` and `lib/audio.ts`.

- **Shared keys:** each key keeps a hold count. Note-on goes out only on the first hold, and note-off only when the last hold is released. The floater and the computer keys can hold the same key without cutting each other off.
- **Changing PLAY TO or CHANNEL** releases every held note first, so nothing is left stuck on the old target.
- **The emulator only plays while SOUND is on.** The floater asks the editor to start SOUND when needed. It waits for audio to start, then plays the key if it's still held.

## Floater

- **Shape:** a `position: fixed` panel. It defaults to centred near the bottom of the viewport, and is clamped back inside it on load and on resize.
- **Dragging:** `motion` drag as windchime's units do it. A drag handle starts it (`dragListener={false}`, `dragControls`), it is constrained to a full-viewport box, has no momentum, and saves its position on drag end.
- **Keys:** they are buttons with pointer capture released, so sliding a pressed pointer onto another key moves the note (glissando). Each pointer id tracks its own key, which makes multi-touch work.
- **Look:** 1-bit, following windchime's rules. White keys are white with a black border, black keys are black, and a held key inverts.
- **Persisted:** position, octave, velocity and target are stored under `vz10m.keys.*`.
