"use client";

// The keyboard floater: the package's KeyboardFloater (two octaves of keys in a panel dragged by its title row, kept
// inside the viewport), with the editor's controls. Notes go through the router (lib/router.ts), so PLAY TO decides
// whether they reach the emulator, the VZ, or both, and keys light up however they are played (here or on the
// computer keyboard). The position is saved on drag end.

import { useEffect, useState, useSyncExternalStore } from "react";
import { Button, KeyboardFloater as Floater, noteName, SelectItem } from "@dblodorn/sound-ui";
import { router } from "../lib/router";
import { TARGETS, type Target } from "../lib/play";
import { store } from "../lib/store";
import * as A from "../lib/audio";
import { Param, ParamSelect, ParamSlider, SMALL } from "./params";
import Info from "./Info";

const KEYS = 25; // two octaves and the top C
const LOWEST = { min: 12, max: 96, start: 48 }; // C0 ... C7, starting at C3

interface Props {
  onClose: () => void;
  // starts SOUND inside the current press; resolves false if it couldn't
  ensureSound: () => Promise<boolean>;
}

const subscribe = (fn: () => void) => router.onHeld(fn);
const getHeld = () => router.held();

export default function KeyboardFloater({ onClose, ensureSound }: Props) {
  const [low, setLow] = useState(LOWEST.start);
  const [velocity, setVelocity] = useState(100);
  const [target, setTarget] = useState<Target>("both");
  const [pos, setPos] = useState<{ x: number; y: number } | undefined>(undefined);
  const held = useSyncExternalStore(subscribe, getHeld, getHeld);

  // ---- settings, read after mount (SSR) and remembered ----
  useEffect(() => {
    setLow(Math.max(LOWEST.min, Math.min(LOWEST.max, store.get("keys.low", LOWEST.start))));
    setVelocity(Math.max(1, Math.min(127, store.get("keys.velocity", 100))));
    const t = store.get<string>("keys.target", "both");
    setTarget(TARGETS.some(o => o.value === t) ? (t as Target) : "both");
    const p = store.get<{ x: number; y: number } | null>("keys.pos", null);
    if (p) setPos(p);
  }, []);
  useEffect(() => { store.set("keys.low", low); }, [low]);
  useEffect(() => { router.setVelocity(velocity); store.set("keys.velocity", velocity); }, [velocity]);
  useEffect(() => { router.setTarget(target); store.set("keys.target", target); }, [target]);
  // closing the floater ends whatever it was holding
  useEffect(() => () => router.allOff(), []);

  // the emulator needs SOUND on: start it inside the press
  const beforePlay = () => (router.target !== "vz" && !A.running() ? ensureSound() : true);

  return (
    <Floater title="KEYS" range={`${noteName(low)}–${noteName(low + KEYS - 1)}`} info={<Info k="keys" />} onClose={onClose}
      position={pos} onPositionChange={p => store.set("keys.pos", p)}
      low={low} count={KEYS} held={held} onNoteOn={n => router.noteOn(n)} onNoteOff={n => router.noteOff(n)} beforePlay={beforePlay}>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[auto_1fr_1fr] sm:items-end">
        <div className="flex items-center gap-1.5">
          <span id="k-oct-label" className={SMALL}>OCTAVE</span>
          <Button aria-label="OCTAVE DOWN" disabled={low <= LOWEST.min} onClick={() => { router.allOff(); setLow(l => Math.max(LOWEST.min, l - 12)); }}>−</Button>
          <Button aria-label="OCTAVE UP" disabled={low >= LOWEST.max} onClick={() => { router.allOff(); setLow(l => Math.min(LOWEST.max, l + 12)); }}>+</Button>
        </div>
        <Param id="k-vel" label="VELOCITY" value={velocity}>
          <ParamSlider id="k-vel" value={velocity} onChange={setVelocity} min={1} max={127} step={1} />
        </Param>
        <Param id="k-to" label="PLAY TO" value="">
          <ParamSelect id="k-to" value={target} display={TARGETS.find(t => t.value === target)!.label} onChange={v => setTarget(v as Target)}>
            {TARGETS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
          </ParamSelect>
        </Param>
      </div>
    </Floater>
  );
}
