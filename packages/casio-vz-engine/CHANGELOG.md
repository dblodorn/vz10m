# Changelog

## 0.1.0

First release, taken out of the VZ-10M editor.

- `createSynth(ctx)`: the emulator as an AudioWorklet node in your `AudioContext`. It loads from a `blob:` URL by default, or from `workletUrl`.
- `createOfflineSynth(sampleRate)`: the same engine without Web Audio, for Node and offline rendering.
- Voices can be read from 336 bytes, a voice SysEx message, or a `.syx` file (`readVoice`, `fromSyx`), and their fields read with `get`, `getName` and `toParams`.
- `PatchSource`, the shape of any voice library.
- `dmbkLibrary`, the dmbk voice library (it needs an API key), and `createDmbkProxyHandler`, a route that holds the key for browser code.
- The sound is the editor's emulator as of this release. Its curves are estimates until checked against the hardware.
