"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import * as A from "../lib/audio";
import * as M from "../lib/midi";
import { router } from "../lib/router";
import * as V from "../lib/vz/codec";
import { TYPE } from "../lib/vz/sysex";
import type { Dir, LivePort, PortInfo, Status } from "../lib/midi";
import { LINES, LINE_MODES, WAVEFORMS, voiceField } from "@dblodorn/casio-vz-engine";
import { store, toB64, fromB64, loadLibrary, saveLibrary, entry, type Entry } from "../lib/store";
import EnvelopeEditor from "./EnvelopeEditor";
import Info from "./Info";
import type { HelpKey } from "../lib/help";
import { Check, FieldRow, NOTE, Param, ParamSelect, ROW, SMALL } from "./params";
import { BreakpointCurve, Button, Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, noteName, SelectItem } from "@dblodorn/sound-ui";

const Library = dynamic(() => import("./Library"), { ssr: false });
const KeyboardFloater = dynamic(() => import("./KeyboardFloater"), { ssr: false });

const CHANNELS = Array.from({ length: 16 }, (_, k) => k + 1);
// the (?) for each of the module's level rows; VEL SENS shares VEL CURVE's
const MODULE_INFO = { envDepth: "envDepth", ampSens: "ampSens", velCurve: "velocity", velSens: undefined } as const;
const MODULES = [1, 2, 3, 4, 5, 6, 7, 8];
interface Device { id: string; label: string }
const deviceName = (d: Device): string => (d.label || "UNNAMED DEVICE").toUpperCase();
const portName = (p: PortInfo): string => p.name.toUpperCase() + (p.manufacturer ? "   " + p.manufacturer.toUpperCase() : "");
// computer keys for auditioning on the VZ: the bottom letter row plays C4 to C5
const KEYS: Record<string, number> = { z: 60, s: 61, x: 62, d: 63, c: 64, v: 65, g: 66, b: 67, h: 68, n: 69, j: 70, m: 71, ",": 72 };

// Undo history: every edit pushes the whole voice (336 bytes), capped.
const LIMIT = 200;
interface History { past: Uint8Array[]; voice: Uint8Array; future: Uint8Array[] }
type Action = { type: "edit"; voice: Uint8Array } | { type: "undo" } | { type: "redo" };

function history(state: History, action: Action): History {
  switch (action.type) {
    case "edit": {
      const past = [...state.past, state.voice].slice(-LIMIT);
      return { past, voice: action.voice, future: [] };
    }
    case "undo": {
      const prev = state.past.at(-1);
      return prev ? { past: state.past.slice(0, -1), voice: prev, future: [state.voice, ...state.future] } : state;
    }
    case "redo": {
      const next = state.future[0];
      return next ? { past: [...state.past, state.voice], voice: next, future: state.future.slice(1) } : state;
    }
  }
}

export default function Editor() {
  const [{ voice, past, future }, dispatch] = useReducer(history, null, (): History => ({ voice: V.initVoice(), past: [], future: [] }));
  const [moduleSel, setModuleSel] = useState(1);
  const [midiOpen, setMidiOpen] = useState(false);
  const [libOpen, setLibOpen] = useState(false);
  const [midiSupported, setMidiSupported] = useState<boolean | null>(null);
  const [midi, setMidi] = useState<Status>(() => M.status());
  const [inputs, setInputs] = useState<PortInfo[]>([]);
  const [outputs, setOutputs] = useState<PortInfo[]>([]);
  const [channel, setChannel] = useState(1);
  const [autoSend, setAutoSend] = useState(false);
  const [msg, setMsg] = useState("");
  const [keysOpen, setKeysOpen] = useState(false); // the keyboard floater
  const [sound, setSound] = useState(false); // the emulator in the browser
  const soundRef = useRef(false);
  // AUDIO: the emulator's output device, as windchime chooses it
  const [audioOpen, setAudioOpen] = useState(false);
  const [audioSupported, setAudioSupported] = useState<boolean | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [wantedDevice, setWantedDevice] = useState<Device>({ id: "", label: "" });
  const [audioMsg, setAudioMsg] = useState("");
  const [library, setLibrary] = useState<Entry[]>([]);
  const restored = useRef(false);

  const edit = useCallback((next: Uint8Array) => dispatch({ type: "edit", voice: next }), []);
  const setValues = useCallback((values: Record<string, number>) => edit(V.setMany(voice, values)), [edit, voice]);
  const val = (key: string): number => V.get(voice, key);

  // ---- persistence: read after mount so the server render matches ----
  useEffect(() => {
    setMidiSupported(M.supported());
    const saved = store.get<string | null>("voice", null);
    if (saved) { try { dispatch({ type: "edit", voice: fromB64(saved) }); } catch (e) {} }
    setChannel(store.get("channel", 1));
    setAutoSend(store.get("autoSend", false));
    M.setWanted("in", store.get("midiIn", ""));
    M.setWanted("out", store.get("midiOut", ""));
    setLibrary(loadLibrary());
    setKeysOpen(store.get("keys.open", false));
    restored.current = true;
  }, []);
  useEffect(() => { if (restored.current) store.set("voice", toB64(voice)); }, [voice]);
  // every voice change reaches the emulator (a no-op until SOUND has started it)
  useEffect(() => { A.setVoice(voice); }, [voice]);
  useEffect(() => { if (restored.current) store.set("channel", channel); }, [channel]);
  useEffect(() => { router.setChannel(channel); }, [channel]);
  useEffect(() => { if (restored.current) store.set("keys.open", keysOpen); }, [keysOpen]);
  useEffect(() => { if (restored.current) store.set("autoSend", autoSend); }, [autoSend]);
  // ---- audio output device ----
  const listDevices = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      // "default" and "communications" are aliases Chrome adds for the system's own choices
      setDevices(all.filter(d => d.kind === "audiooutput" && !["default", "communications"].includes(d.deviceId)).map(d => ({ id: d.deviceId, label: d.label })));
    } catch (e) { setDevices([]); }
  }, []);
  useEffect(() => {
    const ok = A.deviceChoiceSupported() && !!navigator.mediaDevices?.enumerateDevices;
    setAudioSupported(ok);
    const w = store.get<Partial<Device> | null>("audioOut", null);
    if (w && typeof w.id === "string") setWantedDevice({ id: w.id, label: typeof w.label === "string" ? w.label : "" });
    if (!ok) return;
    listDevices();
    navigator.mediaDevices.addEventListener("devicechange", listDevices);
    return () => navigator.mediaDevices.removeEventListener("devicechange", listDevices);
  }, [listDevices]);
  // the device to play on: the wanted one by id, else by name; the system default while it is unplugged. While the
  // browser hides device names (no media permission yet) the list can't be read, so the remembered id is tried as is.
  const namesHidden = !!audioSupported && devices.every(d => !d.label);
  const liveDevice = wantedDevice.id
    ? devices.find(d => d.id === wantedDevice.id) || (wantedDevice.label ? devices.find(d => d.label === wantedDevice.label) : undefined)
    : undefined;
  const deviceGone = !!audioSupported && !!wantedDevice.id && !namesHidden && !liveDevice;
  const sinkId = !audioSupported || !wantedDevice.id ? "" : liveDevice ? liveDevice.id : namesHidden ? wantedDevice.id : "";
  useEffect(() => {
    if (!audioSupported) return;
    A.setDevice(sinkId).catch(e => setAudioMsg(`THAT DEVICE WOULD NOT OPEN${e instanceof Error && e.message ? `: ${e.message}` : ""}.`));
  }, [audioSupported, sinkId]);
  function chooseDevice(v: string) {
    setAudioMsg("");
    const d = v === "default" ? { id: "", label: "" } : devices.find(x => x.id === v);
    if (!d) return;
    setWantedDevice(d);
    store.set("audioOut", d);
  }
  // Browsers only reveal device names after media permission; asking once for the microphone shows them.
  async function onShowNames() {
    setAudioMsg("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
      await listDevices();
    } catch (e) {
      setAudioMsg("THE BROWSER KEPT DEVICE NAMES HIDDEN. ALLOW THE MICROPHONE FOR THIS PAGE TO SEE THEM.");
    }
  }
  const deviceValue = !wantedDevice.id ? "default" : liveDevice ? liveDevice.id : "wanted";
  const deviceText = !wantedDevice.id ? "SYSTEM DEFAULT" : liveDevice ? deviceName(liveDevice) : `${deviceName(wantedDevice)}${namesHidden ? "" : "   DISCONNECTED"}`;

  const updateLibrary = useCallback((fn: (list: Entry[]) => Entry[]) => setLibrary(list => { const next = fn(list); saveLibrary(next); return next; }), []);

  // ---- MIDI ----
  useEffect(() => M.onChange(() => {
    const s = M.status();
    setMidi(s);
    setInputs(M.listInputs());
    setOutputs(M.listOutputs());
    if (s.wanted.in) store.set("midiIn", s.wanted.in);
    if (s.wanted.out) store.set("midiOut", s.wanted.out);
  }), []);

  useEffect(() => M.onSysex(m => {
    if (m.error !== undefined) { setMsg(`RECEIVED A DAMAGED DUMP: ${m.error}`); return; }
    const name = V.getName(m.data);
    if (m.type === TYPE.VOICE) {
      dispatch({ type: "edit", voice: m.data });
      setMsg(`RECEIVED VOICE ${name}. UNDO GOES BACK TO WHAT WAS HERE.`);
    } else {
      updateLibrary(list => [entry("operation", name, m.data), ...list]);
      setMsg(`RECEIVED OPERATION ${name}. SAVED TO THE LIBRARY.`);
    }
  }), [updateLibrary]);

  // SEND ON EDIT: the whole voice to the VZ's edit area, 250 ms after the last change
  useEffect(() => {
    if (!autoSend || !midi.output || !restored.current) return;
    const t = setTimeout(() => M.sendSysex(V.toSysex(voice, { channel })), 250);
    return () => clearTimeout(t);
  }, [voice, autoSend, midi.output, channel]);

  async function onConnect() {
    setMsg("");
    try { await M.connect(); } catch (e) { setMsg(e instanceof Error && e.message ? e.message : "MIDI access was refused."); }
  }
  // Start the emulator inside the current click or key press. Also used by the keyboard floater.
  const startSound = useCallback(async (): Promise<boolean> => {
    if (soundRef.current) return true;
    if (!A.supported()) { setMsg("THIS BROWSER CAN'T RUN THE EMULATOR (NO AUDIO WORKLET)."); return false; }
    try {
      await A.start();
      soundRef.current = true; setSound(true);
      return true;
    } catch (e) {
      setMsg(`THE EMULATOR WOULD NOT START${e instanceof Error && e.message ? `: ${e.message}` : ""}.`);
      return false;
    }
  }, []);
  // SOUND: start the emulator, or silence it; MIDI is unaffected either way
  async function onSound() {
    if (!soundRef.current) { await startSound(); return; }
    soundRef.current = false; setSound(false);
    await A.stop();
  }
  // computer keys go where PLAY TO (on the keyboard floater) says, like the floater's own keys
  const play = (n: number) => router.noteOn(n);
  const release = (n: number) => router.noteOff(n);

  async function onSend() {
    const ok = await M.sendSysex(V.toSysex(voice, { channel }));
    setMsg(ok ? `SENT ${V.getName(voice) || "VOICE"} ON CHANNEL ${channel}.` : "NOTHING SENT: CHOOSE A MIDI OUT PORT.");
  }

  // audition from the computer keyboard, unless typing in a field
  useEffect(() => {
    const held = new Set<number>();
    const typing = (e: KeyboardEvent): boolean => e.target instanceof Element && !!e.target.closest("input, textarea, [role=combobox], [role=slider], [role=listbox]");
    const down = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || typing(e)) return;
      const n = KEYS[e.key.toLowerCase()];
      if (n === undefined || held.has(n)) return;
      held.add(n); play(n);
    };
    const up = (e: KeyboardEvent) => { const n = KEYS[e.key.toLowerCase()]; if (n !== undefined && held.delete(n)) release(n); };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); held.forEach(release); };
  }, [channel]); // eslint-disable-line react-hooks/exhaustive-deps -- play/release read soundRef, not state

  // undo / redo: Cmd/Ctrl+Z, Shift+Cmd/Ctrl+Z
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z" || (e.target instanceof Element && e.target.closest("input"))) return;
      e.preventDefault();
      dispatch({ type: e.shiftKey ? "redo" : "undo" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const name = V.getName(voice);
  const m = `m${moduleSel}`;
  const midiReady = midi.connected;
  const midiLive = !!midi.output;

  return (
    <main className="mx-auto grid max-w-[1180px] gap-5">
      <header className="flex flex-wrap items-center gap-2.5">
        <h1 className="m-0 text-[11px] font-normal tracking-[.08em]">VZ-10M</h1>
        <span className="lead min-w-6" />
        <label className="flex items-center gap-2">
          <span id="name-label" className={SMALL}>NAME</span>
          <input
            aria-labelledby="name-label" value={name} maxLength={12} spellCheck={false}
            onChange={e => edit(V.setName(voice, e.target.value))}
            className="h-8 w-[17ch] border border-foreground bg-background px-2 uppercase tracking-[.06em] outline-none focus-visible:outline-1 focus-visible:outline-offset-3 focus-visible:outline-dashed touch:text-[16px]"
          />
        </label>
        <Button onClick={() => dispatch({ type: "undo" })} disabled={!past.length}>UNDO</Button>
        <Button onClick={() => dispatch({ type: "redo" })} disabled={!future.length}>REDO</Button>
        <Button onClick={() => edit(V.initVoice())}>INIT</Button>
        <span className="flex items-center gap-1.5"><Button aria-pressed={sound} onClick={onSound}>SOUND</Button><Info k="sound" /></span>
        <Button aria-pressed={keysOpen} onClick={() => setKeysOpen(o => !o)}>KEYS</Button>
        <Dialog open={audioOpen} onOpenChange={setAudioOpen}>
          <DialogTrigger asChild>
            <Button className="touch:hidden">AUDIO</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <div className="flex items-baseline gap-2">
                <DialogTitle>AUDIO OUT</DialogTitle>
                <span className="lead" />
                <DialogClose asChild><Button>CLOSE</Button></DialogClose>
              </div>
              <DialogDescription className={NOTE}>Play the emulator through any audio device. SOUND turns it on.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3.5">
              <Param id="a-dev" label="DEVICE" value={deviceGone ? "DISCONNECTED" : sinkId ? "CHOSEN" : "DEFAULT"}>
                <ParamSelect id="a-dev" value={deviceValue} display={deviceText} onChange={chooseDevice} disabled={!audioSupported}>
                  <SelectItem value="default">SYSTEM DEFAULT</SelectItem>
                  {deviceValue === "wanted" && <SelectItem value="wanted" disabled>{deviceText}</SelectItem>}
                  {!namesHidden && devices.map(d => <SelectItem key={d.id} value={d.id}>{deviceName(d)}</SelectItem>)}
                </ParamSelect>
              </Param>
              {namesHidden && (
                <div className={ROW}>
                  <Button onClick={onShowNames}>SHOW DEVICE NAMES</Button>
                  <span className={`${NOTE} min-w-0`}>The browser shows device names only after you allow the microphone once. Nothing is recorded.</span>
                </div>
              )}
              {audioSupported === false && <p className={NOTE}>THIS BROWSER PLAYS THROUGH THE SYSTEM OUTPUT. CHOOSE THE DEVICE IN YOUR SYSTEM SETTINGS.</p>}
              {audioMsg && <p className={NOTE}>{audioMsg}</p>}
            </div>
          </DialogContent>
        </Dialog>
        <Button onClick={onSend} disabled={!midiLive}>SEND</Button>
        <Button onClick={() => setLibOpen(true)}>LIBRARY</Button>
        <Dialog open={midiOpen} onOpenChange={setMidiOpen}>
          <DialogTrigger asChild>
            <Button data-live={midiLive || undefined} className="data-[live]:bg-foreground data-[live]:text-background">MIDI</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <div className="flex items-baseline gap-2">
                <DialogTitle>MIDI</DialogTitle>
                <Info k="midi" />
                <span className="lead" />
                <DialogClose asChild><Button>CLOSE</Button></DialogClose>
              </div>
              <DialogDescription className={NOTE}>Voices travel as SysEx both ways. The browser asks for SysEx access when you connect.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3.5">
              {!midiReady ? (
                <div className={ROW}>
                  <Button onClick={onConnect} disabled={midiSupported === false}>CONNECT MIDI</Button>
                  {midiSupported === false && <span className={NOTE}>This browser has no Web MIDI. Use Chrome or Edge on a computer.</span>}
                </div>
              ) : (
                <>
                  {([["in", "MIDI IN", inputs, midi.input], ["out", "MIDI OUT", outputs, midi.output]] as [Dir, string, PortInfo[], LivePort | null][]).map(([dir, label, ports, live]) => (
                    <Param key={dir} id={`m-${dir}`} label={label} value={live ? "OPEN" : "NONE"}>
                      <ParamSelect id={`m-${dir}`} value={live ? live.id : "none"} display={live ? portName(live) : "NONE"} onChange={v => M.select(dir, v === "none" ? "" : v)}>
                        <SelectItem value="none">NONE</SelectItem>
                        {!live && midi.wanted[dir] && <SelectItem value="wanted" disabled>{midi.wanted[dir].toUpperCase()}   DISCONNECTED</SelectItem>}
                        {ports.map(p => <SelectItem key={p.id} value={p.id}>{portName(p)}</SelectItem>)}
                      </ParamSelect>
                    </Param>
                  ))}
                  <Param id="m-ch" label="CHANNEL" value={channel}>
                    <ParamSelect id="m-ch" value={String(channel)} display={`CHANNEL ${channel}`} onChange={v => setChannel(Number(v))}>
                      {CHANNELS.map(c => <SelectItem key={c} value={String(c)}>CHANNEL {c}</SelectItem>)}
                    </ParamSelect>
                  </Param>
                  <Check checked={autoSend} onChange={setAutoSend}>SEND ON EDIT</Check>
                  <div className={ROW}>
                    <Button disabled={!midiLive} onClick={() => { M.noteOn(channel, 60); setTimeout(() => M.noteOff(channel, 60), 500); }}>TEST NOTE</Button>
                    <Button disabled={!midiLive} onClick={() => { router.allOff(); M.allNotesOff(channel); A.allOff(); }}>PANIC</Button>
                  </div>
                  <p className={NOTE}>On the VZ-10M: set MENU 3-04 EXCLUSIVE to ENA, and MENU 3-03 RECEIVE CH to the CHANNEL above. To get a voice into the editor, pick it on the VZ (A–H, 1–8) in NORMAL or COMBI play; it is sent as you select it. Operations are sent from OP MEM mode. Voices sent from here land in the VZ&apos;s compare/recall area: press WRITE on the VZ to keep one. Play notes with KEYS or the Z–M keys; PLAY TO on the keyboard sends them to the VZ, the emulator, or both.</p>
                  {!inputs.length && !outputs.length && <p className={NOTE}>No MIDI ports found. Plug in an interface.</p>}
                </>
              )}
              {midi.error && <p className={NOTE}>{midi.error}</p>}
            </div>
          </DialogContent>
        </Dialog>
      </header>

      {msg && <p role="status" className={`${NOTE} max-w-none`}>{msg}</p>}

      {/* the four lines, each a pair of modules: the second module always feeds the line */}
      <div className="-mb-2 flex items-baseline gap-2">
        <h2 className="m-0 text-[11px] font-normal tracking-[.08em]">LINES</h2>
        <Info k="ipd" />
        <span className="lead" />
        <span className={SMALL}>M1+M2 · M3+M4 · M5+M6 · M7+M8</span>
      </div>
      <section aria-label="LINES" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {LINES.map((L, l) => {
          const pair = [l * 2 + 1, l * 2 + 2];
          const mode = val(`line${L}.mode`);
          return (
            <div key={L} role="group" aria-label={`LINE ${L}`} className="grid gap-2 border border-foreground p-2.5">
              <Param id={`line-${L}`} label={`LINE ${L}`} value={LINE_MODES[mode]} info="line">
                <ParamSelect id={`line-${L}`} value={String(mode)} display={LINE_MODES[mode]} onChange={v => setValues({ [`line${L}.mode`]: Number(v) })}>
                  {LINE_MODES.map((o, i) => <SelectItem key={o} value={String(i)}>{o}</SelectItem>)}
                </ParamSelect>
              </Param>
              <div className="grid grid-cols-2 gap-2">
                {pair.map(n => {
                  const on = val(`m${n}.off`) === 0;
                  return (
                    <button key={n} aria-pressed={moduleSel === n} onClick={() => setModuleSel(n)}
                      className={`grid cursor-pointer gap-0.5 border border-foreground bg-background p-1.5 text-left text-foreground hover:bg-foreground hover:text-background aria-pressed:bg-foreground aria-pressed:text-background focus-visible:outline-1 focus-visible:outline-offset-3 focus-visible:outline-dashed ${on ? "" : "opacity-40"}`}>
                      <span className="tracking-[.08em]">M{n}</span>
                      <span className={SMALL}>{WAVEFORMS[val(`m${n}.wave`)]}</span>
                      <span className={SMALL}>{on ? "ON" : "OFF"}</span>
                    </button>
                  );
                })}
              </div>
              {l > 0 && (
                <FieldRow id={`ext-${L}`} field={voiceField(`m${pair[1]}.extPhase`)} label="EXT PHASE FROM PREVIOUS LINE" info="extPhase" value={val(`m${pair[1]}.extPhase`)} onChange={v => setValues({ [`m${pair[1]}.extPhase`]: v })} />
              )}
            </div>
          );
        })}
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section aria-label={`MODULE ${moduleSel}`} className="grid content-start gap-3.5">
          <div className="flex items-baseline gap-2">
            <h2 className="m-0 text-[11px] font-normal tracking-[.08em]">MODULE M{moduleSel}</h2>
            <Info k="module" />
            <span className="lead" />
            <Check checked={val(`${m}.off`) === 0} onChange={v => setValues({ [`${m}.off`]: v ? 0 : 1 })}>ON</Check>
          </div>
          <FieldRow id="wave" info="wave" field={voiceField(`${m}.wave`)} value={val(`${m}.wave`)} onChange={v => setValues({ [`${m}.wave`]: v })} />
          <Param id="detune" label="DETUNE" info="detune" value={`${val(`${m}.detunePlus`) ? "+" : "-"}${val(`${m}.note`)} NOTES  ${val(`${m}.fine`)} FINE`}>
            <div className="mt-1 grid gap-2">
              <FieldRow id="note" field={voiceField(`${m}.note`)} value={val(`${m}.note`)} onChange={v => setValues({ [`${m}.note`]: v })} />
              <FieldRow id="fine" field={voiceField(`${m}.fine`)} value={val(`${m}.fine`)} onChange={v => setValues({ [`${m}.fine`]: v })} />
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {["detunePlus", "fix", "fixRange"].map(k => (
                  <FieldRow key={k} id={k} field={voiceField(`${m}.${k}`)} value={val(`${m}.${k}`)} onChange={v => setValues({ [`${m}.${k}`]: v })} />
                ))}
              </div>
            </div>
          </Param>
          {(["envDepth", "ampSens", "velCurve", "velSens"] as const).map(k => (
            <FieldRow key={k} id={k} info={MODULE_INFO[k]} field={voiceField(`${m}.${k}`)} value={val(`${m}.${k}`)} onChange={v => setValues({ [`${m}.${k}`]: v })} />
          ))}
          <Param id="dca-env" label="DCA ENVELOPE" value={`M${moduleSel}`} info="dcaEnv" />
          <EnvelopeEditor id="dca" data={voice} prefix={m} onChange={setValues} />
          <KeyFollow id="dca-kf" title="DCA KEY FOLLOW" info="dcaKf" prefix={m} second="level" voice={voice} onChange={setValues} />
        </section>

        <section aria-label="VOICE" className="grid content-start gap-3.5">
          <div className="flex items-baseline gap-2">
            <h2 className="m-0 text-[11px] font-normal tracking-[.08em]">VOICE</h2>
            <span className="lead" />
          </div>
          <FieldRow id="level" info="totalLevel" field={voiceField("level")} label="TOTAL LEVEL" value={val("level")} onChange={v => setValues({ level: v })} />
          <Param id="octave" label="OCTAVE" info="octave" value={`${val("octavePlus") ? "+" : "-"}${val("octave")}`}>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1.5">
              <FieldRow id="octave-plus" field={voiceField("octavePlus")} value={val("octavePlus")} onChange={v => setValues({ octavePlus: v })} />
            </div>
            <FieldRow id="octave-n" field={voiceField("octave")} value={val("octave")} onChange={v => setValues({ octave: v })} />
          </Param>
          <Param id="dco-env" label="PITCH (DCO) ENVELOPE" info="pitchEnv" value={val("dco.range") ? "WIDE" : "NARROW"} />
          <EnvelopeEditor id="dco" data={voice} prefix="dco" onChange={setValues} />
          <FieldRow id="dco-depth" field={voiceField("dco.envDepth")} value={val("dco.envDepth")} onChange={v => setValues({ "dco.envDepth": v })} />
          <FieldRow id="dco-range" field={voiceField("dco.range")} value={val("dco.range")} onChange={v => setValues({ "dco.range": v })} />
          {["dco.velCurve", "dco.velSens", "rate.velCurve", "rate.velSens"].map(k => (
            <FieldRow key={k} id={k.replace(".", "-")} info={k === "dco.velCurve" ? "pitchVel" : undefined} field={voiceField(k)} label={`${k.startsWith("dco") ? "PITCH" : "RATE"} ${voiceField(k).label}`} value={val(k)} onChange={v => setValues({ [k]: v })} />
          ))}
          <KeyFollow id="dco-kf" title="PITCH KEY FOLLOW" info="pitchKf" prefix="dco" second="level" voice={voice} onChange={setValues} />
          <KeyFollow id="rate-kf" title="RATE KEY FOLLOW" info="rateKf" prefix="rate" second="rate" voice={voice} onChange={setValues} />
          {([["vib", "VIBRATO", "vibrato"], ["trem", "TREMOLO", "tremolo"]] as const).map(([p, title, info]) => (
            <div key={p} role="group" aria-label={title} className="grid gap-2.5 border border-foreground p-2.5">
              <span className="flex items-center gap-2"><span className="tracking-[.08em]">{title}</span><Info k={info} /></span>
              {["wave", "depth", "rate", "delay", "multi"].map(k => (
                <FieldRow key={k} id={`${p}-${k}`} field={voiceField(`${p}.${k}`)} value={val(`${p}.${k}`)} onChange={v => setValues({ [`${p}.${k}`]: v })} />
              ))}
            </div>
          ))}
        </section>
      </div>

      <footer className={`flex flex-wrap items-center gap-3 ${SMALL}`}>
        <span>VALUES ARE RAW STORED VALUES; THE VZ PANEL SHOWS SOME ON A 0–99 SCALE.</span>
        <span className="lead min-w-6" />
        <Link href="/changelog" className="text-foreground">CHANGELOG</Link>
      </footer>

      {keysOpen && <KeyboardFloater onClose={() => setKeysOpen(false)} ensureSound={startSound} />}

      {libOpen && (
        <Library
          open={libOpen} onOpenChange={setLibOpen}
          library={library} updateLibrary={updateLibrary}
          voice={voice} onOpen={bytes => { edit(bytes); setLibOpen(false); }}
          canSend={midiLive} onSend={async list => { const ok = await M.sendSysex(list.map(d => V.toSysex(d, { channel }))); setMsg(ok ? `SENT ${list.length} DUMP${list.length === 1 ? "" : "S"}.` : "NOTHING SENT: CHOOSE A MIDI OUT PORT."); }}
        />
      )}
    </main>
  );
}

interface KeyFollowProps {
  id: string;
  title: string;
  info: HelpKey;
  prefix: string; // "m1".."m8", "dco" or "rate"
  second: "level" | "rate"; // what each breakpoint sets besides its key
  voice: Uint8Array;
  onChange: (values: Record<string, number>) => void;
}

// six (key, value) breakpoints; keys are MIDI note numbers. The package's BreakpointCurve: drag a point sideways to
// move its key, up and down for its value.
function KeyFollow({ id, title, info, prefix, second, voice, onChange }: KeyFollowProps) {
  const f = (s: number, part: string): string => `${prefix}.kf${s}.${part}`;
  const points = [1, 2, 3, 4, 5, 6].map(s => ({ key: V.get(voice, f(s, "key")), value: V.get(voice, f(s, second)) }));
  const keyF = voiceField(f(1, "key")), valueF = voiceField(f(1, second));
  return (
    <div className="grid gap-2">
      <Param id={`${id}-t`} label={title} value="" info={info} />
      <BreakpointCurve
        id={id} label={title} points={points} keyRange={[keyF.min, keyF.max]} valueRange={[valueF.min, valueF.max]}
        onChange={(i, c) => onChange("key" in c ? { [f(i + 1, "key")]: c.key } : { [f(i + 1, second)]: c.value })}
        keyLabel={i => `STEP ${i + 1} KEY`} valueLabel={i => `STEP ${i + 1} ${valueF.label}`} displayKey={noteName}
      />
    </div>
  );
}
