import { test } from "node:test";
import assert from "node:assert/strict";
import { createOfflineSynth } from "../src/index.ts";
import { initVoice, set, voiceMessage } from "./voices.ts";

const peak = (a: Float32Array): number => a.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

test("1 s of note 60 at 44 100 Hz, in Node, with no browser globals", () => {
  assert.equal(typeof (globalThis as Record<string, unknown>).window, "undefined");
  assert.equal(typeof (globalThis as Record<string, unknown>).AudioContext, "undefined");
  const s = createOfflineSynth(44100);
  s.loadVoice(initVoice());
  s.noteOn(60, 100);
  const out = new Float32Array(44100);
  s.render(out);
  assert.equal(out.length, 44100);
  assert.ok(peak(out) > 0.01);
});

test("a voice SysEx message loads like its bytes", () => {
  const v = set(initVoice(), "m1.wave", 3);
  const a = createOfflineSynth(48000), b = createOfflineSynth(48000);
  a.loadVoice(v); b.loadVoice(voiceMessage(v));
  const x = new Float32Array(4800), y = new Float32Array(4800);
  a.noteOn(64); b.noteOn(64); a.render(x); b.render(y);
  assert.deepEqual(x, y);
});

test("335 bytes are refused and the previous voice keeps playing", () => {
  const s = createOfflineSynth(48000), ref = createOfflineSynth(48000);
  s.loadVoice(initVoice()); ref.loadVoice(initVoice());
  assert.throws(() => s.loadVoice(new Uint8Array(335)), /336/);
  const x = new Float32Array(4800), y = new Float32Array(4800);
  s.noteOn(60); ref.noteOn(60); s.render(x); ref.render(y);
  assert.ok(peak(x) > 0.01);
  assert.deepEqual(x, y);
});

test("notes and velocities out of range are refused and play nothing", () => {
  const s = createOfflineSynth(48000);
  s.loadVoice(initVoice());
  assert.throws(() => s.noteOn(128), RangeError);
  assert.throws(() => s.noteOn(-1), RangeError);
  assert.throws(() => s.noteOn(60.5), RangeError);
  assert.throws(() => s.noteOn(60, 128), RangeError);
  assert.throws(() => s.noteOff(200), RangeError);
  const out = new Float32Array(4800);
  s.render(out);
  assert.equal(peak(out), 0);
});

test("velocity 0 is a note-off", () => {
  const a = createOfflineSynth(48000), b = createOfflineSynth(48000);
  for (const s of [a, b]) { s.loadVoice(initVoice()); s.noteOn(60, 100); s.render(new Float32Array(4800)); }
  a.noteOn(60, 0); b.noteOff(60);
  const x = new Float32Array(48000), y = new Float32Array(48000);
  a.render(x); b.render(y);
  assert.deepEqual(x, y);
  assert.ok(peak(x.subarray(47000)) < peak(x.subarray(0, 1000)), "the note releases");
});

test("all notes off releases every note", () => {
  const s = createOfflineSynth(48000);
  s.loadVoice(initVoice());
  s.noteOn(60); s.noteOn(64); s.noteOn(67);
  s.render(new Float32Array(4800));
  s.allNotesOff();
  const out = new Float32Array(96000);
  s.render(out);
  assert.equal(peak(out.subarray(90000)), 0);
});

test("render replaces what was in the buffer and stays in bounds", () => {
  const s = createOfflineSynth(48000);
  s.loadVoice(initVoice());
  const out = new Float32Array(256).fill(9);
  s.render(out, 128, 128);
  assert.equal(out[0], 9);
  assert.equal(out[200], 0);
  assert.throws(() => s.render(out, 200, 100), RangeError);
});
