// Web MIDI in and out for the VZ-10M: SysEx dumps both ways, plus notes for auditioning.
// Ported from windchime's lib/midiout.js (same port lifecycle) and extended with an input port and SysEx.
// Browser support: Chrome, Edge and Opera. Firefox asks for a site permission add-on for SysEx. Safari and iOS
// have no Web MIDI.

import { isVz, parse, type Parsed } from "./vz/sysex.ts";

export type Dir = "in" | "out";
export interface PortInfo { id: string; name: string; manufacturer: string }
export interface LivePort extends PortInfo { state: MIDIPortDeviceState; connection: MIDIPortConnectionState }
export interface Status {
  connected: boolean;
  wanted: Record<Dir, string>;
  error: string;
  input: LivePort | null;
  output: LivePort | null;
}
// a VZ dump received on MIDI IN, or the reason it couldn't be read
export type Received = (Parsed & { raw: Uint8Array; error?: undefined }) | { error: string; raw: Uint8Array };

let access: MIDIAccess | null = null;
let pending: Promise<MIDIAccess> | null = null; // in-flight requestMIDIAccess, so a double click asks once
let output: MIDIOutput | null = null;           // live ports, written only by setLive()
let input: MIDIInput | null = null;
const wanted: Record<Dir, string> = { in: "", out: "" }; // names of the chosen ports; survive unplugging
let lastError = "";
const listeners = new Set<() => void>();
const sysexListeners = new Set<(m: Received) => void>();
const sounding = new Set<string>(); // "channel:note" held by audition keys

export const supported = (): boolean => typeof navigator !== "undefined" && typeof navigator.requestMIDIAccess === "function";

function emit(): void { listeners.forEach(fn => fn()); }
export function onChange(fn: () => void): () => void { listeners.add(fn); return () => { listeners.delete(fn); }; }

// fn is called once for each VZ dump received, damaged or not
export function onSysex(fn: (m: Received) => void): () => void { sysexListeners.add(fn); return () => { sysexListeners.delete(fn); }; }

const live = <P extends MIDIPort>(map: ReadonlyMap<string, P> | undefined): P[] =>
  map ? [...map.values()].filter(p => p.state === "connected") : [];
const describe = (p: MIDIPort): PortInfo => ({ id: p.id, name: p.name || "Unnamed port", manufacturer: p.manufacturer || "" });

function onMessage(e: MIDIMessageEvent): void {
  const raw = e.data;
  if (!raw || raw[0] !== 0xf0 || !isVz(raw)) return;
  let msg: Received;
  try { msg = { ...parse(raw), raw }; } catch (err) { msg = { error: err instanceof Error ? err.message : String(err), raw }; }
  sysexListeners.forEach(fn => fn(msg));
}

// The only place `input` / `output` change. Opens the port so it reads OPEN before the first message.
function setLive(dir: Dir, port: MIDIPort | null): void {
  const current = dir === "in" ? input : output;
  if (port === current) return;
  if (dir === "in") {
    if (input) input.onmidimessage = null;
    input = port as MIDIInput | null;
    if (input) input.onmidimessage = onMessage;
  } else {
    output = port as MIDIOutput | null;
  }
  lastError = "";
  if (port) {
    port.open().then(emit, (err: unknown) => {
      if ((dir === "in" ? input : output) !== port) return;
      const why = err instanceof Error && err.message ? ` (${err.message})` : "";
      lastError = `${port.name || "The port"} would not open${why}. Another app may be using it.`;
      emit();
    });
  }
  emit();
}

// Pick up the wanted ports when present. On connect, fall back to the only port there is.
function adopt(first: boolean): void {
  if (!access) return;
  for (const dir of ["in", "out"] as const) {
    const ports: MIDIPort[] = dir === "in" ? live(access.inputs) : live(access.outputs);
    const current = dir === "in" ? input : output;
    const match = wanted[dir] ? ports.find(p => p.name === wanted[dir]) : undefined;
    if (match) { if (match !== current) setLive(dir, match); continue; }
    const only = ports.length === 1 ? ports[0] : undefined;
    if (first && !current && only) {
      if (!wanted[dir]) wanted[dir] = only.name || "";
      setLive(dir, only);
    }
  }
}

function onState(e: MIDIConnectionEvent): void {
  const p = e.port;
  if (p && p.state === "disconnected") {
    if (output && p.id === output.id) { sounding.clear(); setLive("out", null); }
    if (input && p.id === input.id) setLive("in", null);
  }
  adopt(false);
  emit();
}

// Must follow a click: browsers show a permission prompt, a stronger one for SysEx.
export async function connect(): Promise<void> {
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
export const isConnected = (): boolean => !!access;

// Seed the remembered port names before connect().
export function setWanted(dir: Dir, name: string): void { wanted[dir] = name || ""; }

export const listInputs = (): PortInfo[] => live(access?.inputs).map(describe);
export const listOutputs = (): PortInfo[] => live(access?.outputs).map(describe);

export function select(dir: Dir, id: string): void {
  const port = (id && access && (dir === "in" ? access.inputs.get(id) : access.outputs.get(id))) || null;
  if (dir === "out" && output && port !== output) allNotesOff();
  wanted[dir] = port ? port.name || "" : "";
  setLive(dir, port);
  emit();
}

// One snapshot for the UI.
export function status(): Status {
  const port = (p: MIDIPort | null): LivePort | null => (p ? { ...describe(p), state: p.state, connection: p.connection } : null);
  return { connected: !!access, wanted: { ...wanted }, error: lastError, input: port(input), output: port(output) };
}

function send(bytes: number[] | Uint8Array): boolean {
  if (!output) return false;
  try { output.send(bytes); return true; } catch (e) {
    lastError = `Send failed: ${e instanceof Error ? e.message : String(e)}`;
    emit();
    return false;
  }
}

// One dump, or several with a pause between them so the VZ can store each before the next arrives.
// The gap is a cautious guess, not a figure from Casio; a bulk send will tell us if it can be shorter.
export async function sendSysex(messages: Uint8Array | Uint8Array[], gapMs = 150): Promise<boolean> {
  const list = messages instanceof Uint8Array ? [messages] : messages;
  for (let i = 0; i < list.length; i++) {
    if (!send(list[i]!)) return false;
    if (i < list.length - 1) await new Promise(r => setTimeout(r, gapMs));
  }
  return true;
}

const nib = (ch: number): number => Math.max(1, Math.min(16, ch | 0)) - 1;

export function noteOn(ch: number, n: number, vel = 100): void {
  if (send([0x90 | nib(ch), n & 127, Math.max(1, Math.min(127, vel | 0))])) sounding.add(`${nib(ch)}:${n}`);
}
export function noteOff(ch: number, n: number): void {
  send([0x80 | nib(ch), n & 127, 0]);
  sounding.delete(`${nib(ch)}:${n}`);
}

// PANIC: note-off for every held key, then All Notes Off and All Sound Off on the channel.
export function allNotesOff(ch = 1): void {
  const cs = new Set([nib(ch)]);
  sounding.forEach(key => {
    const [c = 0, n = 0] = key.split(":").map(Number);
    send([0x80 | c, n, 0]);
    cs.add(c);
  });
  sounding.clear();
  cs.forEach(c => { send([0xb0 | c, 123, 0]); send([0xb0 | c, 120, 0]); });
}
