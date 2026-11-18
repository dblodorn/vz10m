// Render a VZ voice to a WAV with the emulator, offline. For listening without a browser, and for matching
// renders against recordings of the hardware (calibration: issue #1).
//
//   node scripts/render.ts <voice.syx> <note> <hold seconds> <out.wav> [tail seconds]
//
// Takes the first voice in the file. The note is held for `hold`, then released and rendered for `tail` (default 2 s).

import { readFileSync, writeFileSync } from "node:fs";
import { createOfflineSynth, fromSyx } from "@dblodorn/casio-vz-engine";

const SR = 48000, BLOCK = 128;
const [file, noteArg, holdArg, outPath, tailArg = "2"] = process.argv.slice(2);
if (!file || !noteArg || !holdArg || !outPath) {
  console.error("usage: node scripts/render.ts <voice.syx> <note> <hold seconds> <out.wav> [tail seconds]");
  process.exit(1);
}

const { items } = fromSyx(new Uint8Array(readFileSync(file)));
const voice = items.find(i => i.kind === "voice");
if (!voice) { console.error(`no voice in ${file}`); process.exit(1); }

const synth = createOfflineSynth(SR);
synth.loadVoice(voice.data);
const note = Number(noteArg), hold = Math.round(Number(holdArg) * SR), tail = Math.round(Number(tailArg) * SR);
const out = new Float32Array(hold + tail);
synth.noteOn(note);
for (let at = 0; at < out.length; at += BLOCK) {
  if (at <= hold && at + BLOCK > hold) synth.noteOff(note);
  synth.render(out, Math.min(BLOCK, out.length - at), at);
}

// 16-bit mono PCM WAV
const pcm = Buffer.alloc(44 + out.length * 2);
pcm.write("RIFF", 0); pcm.writeUInt32LE(36 + out.length * 2, 4); pcm.write("WAVE", 8);
pcm.write("fmt ", 12); pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(1, 22);
pcm.writeUInt32LE(SR, 24); pcm.writeUInt32LE(SR * 2, 28); pcm.writeUInt16LE(2, 32); pcm.writeUInt16LE(16, 34);
pcm.write("data", 36); pcm.writeUInt32LE(out.length * 2, 40);
let peak = 0;
out.forEach((s, i) => { peak = Math.max(peak, Math.abs(s)); pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32767), 44 + i * 2); });
writeFileSync(outPath, pcm);
console.log(`${voice.name}: note ${note}, ${(out.length / SR).toFixed(2)} s, peak ${peak.toFixed(3)} -> ${outPath}`);
