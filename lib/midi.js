// Web MIDI in and out for the VZ-10M: SysEx dumps both ways, plus notes for auditioning.
// Ported from windchime's lib/midiout.js (same port lifecycle) and extended with an input port and SysEx.
// Browser support: Chrome, Edge and Opera. Firefox asks for a site permission add-on for SysEx. Safari and iOS
// have no Web MIDI.

import { isVz, parse } from "./vz/sysex.js";

let access = null;
let pending = null;       // in-flight requestMIDIAccess, so a double click asks once
let output = null;        // live ports, written only by setLive()
let input = null;
const wanted = { in: "", out: "" }; // names of the chosen ports; survive unplugging
let lastError = "";
const listeners = new Set();
const sysexListeners = new Set();
const sounding = new Set(); // "channel:note" held by audition keys

export const supported = () => typeof navigator !== "undefined" && typeof navigator.requestMIDIAccess === "function";

function emit() { listeners.forEach(fn => fn()); }
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

// fn({ type, channel, area, data, raw }) for each VZ dump received, or fn({ error, raw }) for a damaged one
export function onSysex(fn) { sysexListeners.add(fn); return () => sysexListeners.delete(fn); }

const live = map => (access ? [...map.values()].filter(p => p.state === "connected") : []);
const describe = p => ({ id: p.id, name: p.name || "Unnamed port", manufacturer: p.manufacturer || "" });

function onMessage(e) {
  const raw = e.data;
  if (!raw || raw[0] !== 0xf0 || !isVz(raw)) return;
  let msg;
  try { msg = { ...parse(raw), raw }; } catch (err) { msg = { error: err.message, raw }; }
  sysexListeners.forEach(fn => fn(msg));
}

// The only place `input` / `output` change. Opens the port so it reads OPEN before the first message.
function setLive(dir, port) {
  const current = dir === "in" ? input : output;
  if (port === current) return;
  if (dir === "in") {
    if (input) input.onmidimessage = null;
    input = port;
    if (port) port.onmidimessage = onMessage;
  } else {
    output = port;
  }
  lastError = "";
  if (port && typeof port.open === "function") {
    port.open().then(emit, err => {
      if ((dir === "in" ? input : output) !== port) return;
      lastError = `${port.name || "The port"} would not open${err && err.message ? ` (${err.message})` : ""}. Another app may be using it.`;
      emit();
    });
  }
  emit();
}

// Pick up the wanted ports when present. On connect, fall back to the only port there is.
function adopt(first) {
  for (const dir of ["in", "out"]) {
    const ports = live(dir === "in" ? access.inputs : access.outputs);
    const current = dir === "in" ? input : output;
    const match = wanted[dir] && ports.find(p => p.name === wanted[dir]);
    if (match) { if (match !== current) setLive(dir, match); continue; }
    if (first && !current && ports.length === 1) {
      if (!wanted[dir]) wanted[dir] = ports[0].name;
      setLive(dir, ports[0]);
    }
  }
}

function onState(e) {
  const p = e.port;
  if (p && p.state === "disconnected") {
    if (output && p.id === output.id) { sounding.clear(); setLive("out", null); }
    if (input && p.id === input.id) setLive("in", null);
  }
  adopt(false);
  emit();
}

// Must follow a click: browsers show a permission prompt, a stronger one for SysEx.
export async function connect() {
  if (!supported()) throw new Error("This browser has no Web MIDI. Use Chrome or Edge on a computer.");
  if (!access) {
    pending = pending || navigator.requestMIDIAccess({ sysex: true });
    try {
      const a = await pending;
      a.onstatechange = onState;
      access = a;
    } finally {
      pending = null;
    }
  }
  adopt(true);
  emit();
}
export const isConnected = () => !!access;

// Seed the remembered port names before connect().
export function setWanted(dir, name) { wanted[dir] = name || ""; }

export const listInputs = () => live(access ? access.inputs : new Map()).map(describe);
export const listOutputs = () => live(access ? access.outputs : new Map()).map(describe);

export function select(dir, id) {
  const map = access && (dir === "in" ? access.inputs : access.outputs);
  const port = (map && id && map.get(id)) || null;
  if (dir === "out" && output && port !== output) allNotesOff();
  wanted[dir] = port ? port.name : "";
  setLive(dir, port);
  emit();
}

// One snapshot for the UI.
export function status() {
  const port = p => (p ? { ...describe(p), state: p.state, connection: p.connection } : null);
  return { connected: !!access, wanted: { ...wanted }, error: lastError, input: port(input), output: port(output) };
}

function send(bytes) {
  if (!output) return false;
  try { output.send(bytes); return true; } catch (e) { lastError = `Send failed: ${e.message}`; emit(); return false; }
}

// One dump, or several with a pause between them so the VZ can store each before the next arrives.
// The gap is a cautious guess, not a figure from Casio; a bulk send will tell us if it can be shorter.
export async function sendSysex(messages, gapMs = 150) {
  const list = messages instanceof Uint8Array ? [messages] : messages;
  for (let i = 0; i < list.length; i++) {
    if (!send(list[i])) return false;
    if (i < list.length - 1) await new Promise(r => setTimeout(r, gapMs));
  }
  return true;
}

const nib = ch => Math.max(1, Math.min(16, ch | 0)) - 1;

export function noteOn(ch, n, vel = 100) {
  if (send([0x90 | nib(ch), n & 127, Math.max(1, Math.min(127, vel | 0))])) sounding.add(`${nib(ch)}:${n}`);
}
export function noteOff(ch, n) {
  send([0x80 | nib(ch), n & 127, 0]);
  sounding.delete(`${nib(ch)}:${n}`);
}

// PANIC: note-off for every held key, then All Notes Off and All Sound Off on the channel.
export function allNotesOff(ch = 1) {
  const cs = new Set([nib(ch)]);
  sounding.forEach(key => { const [c, n] = key.split(":").map(Number); send([0x80 | c, n, 0]); cs.add(c); });
  sounding.clear();
  cs.forEach(c => { send([0xb0 | c, 123, 0]); send([0xb0 | c, 120, 0]); });
}
