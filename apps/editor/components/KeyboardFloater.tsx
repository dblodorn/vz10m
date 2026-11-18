"use client";

// The keyboard floater: two octaves of keys in a panel that can be dragged anywhere on the page. Notes go through
// the router (lib/router.ts), so PLAY TO decides whether they reach the emulator, the VZ, or both, and keys light
// up however they are played (here or on the computer keyboard).
// Dragging follows windchime's units: motion drag started from a handle, kept inside the viewport, no momentum,
// the position saved on drag end.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from "react";
import { motion, useDragControls, useMotionValue } from "motion/react";
import { router } from "../lib/router";
import { TARGETS, type Target } from "../lib/play";
import { store } from "../lib/store";
import * as A from "../lib/audio";
import { Param, ParamSelect, ParamSlider, SMALL } from "./params";
import Info from "./Info";
import { Button } from "@/components/ui/button";
import { SelectItem } from "@/components/ui/select";

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const noteName = (n: number): string => NOTE_NAMES[n % 12]! + (Math.floor(n / 12) - 1);
const BLACK = new Set([1, 3, 6, 8, 10]);
const KEYS = 25; // two octaves and the top C
const LOWEST = { min: 12, max: 96, start: 48 }; // C0 ... C7, starting at C3
const WHITE_COUNT = Array.from({ length: KEYS }, (_, i) => i).filter(i => !BLACK.has(i % 12)).length;

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
  const held = useSyncExternalStore(subscribe, getHeld, getHeld);

  const bounds = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const dragControls = useDragControls();
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  // ---- settings, read after mount (SSR) and remembered ----
  useEffect(() => {
    setLow(Math.max(LOWEST.min, Math.min(LOWEST.max, store.get("keys.low", LOWEST.start))));
    setVelocity(Math.max(1, Math.min(127, store.get("keys.velocity", 100))));
    const t = store.get<string>("keys.target", "both");
    setTarget(TARGETS.some(o => o.value === t) ? (t as Target) : "both");
    const pos = store.get<{ x: number; y: number } | null>("keys.pos", null);
    if (pos) { x.set(pos.x); y.set(pos.y); }
  }, [x, y]);
  useEffect(() => { store.set("keys.low", low); }, [low]);
  useEffect(() => { router.setVelocity(velocity); store.set("keys.velocity", velocity); }, [velocity]);
  useEffect(() => { router.setTarget(target); store.set("keys.target", target); }, [target]);
  // closing the floater ends whatever it was holding
  useEffect(() => () => router.allOff(), []);

  // keep the panel inside the viewport when the window changes size (motion keeps it inside while dragging)
  useEffect(() => {
    const fit = () => {
      const p = panel.current;
      if (!p) return;
      const r = p.getBoundingClientRect(), W = window.innerWidth, H = window.innerHeight;
      if (r.left < 0) x.set(x.get() - r.left); else if (r.right > W) x.set(x.get() - (r.right - W));
      if (r.top < 0) y.set(y.get() - r.top); else if (r.bottom > H) y.set(y.get() - (r.bottom - H));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [x, y]);

  // ---- playing: each pointer holds one key; sliding moves it (glissando) ----
  const pointers = useRef(new Map<number, number>());
  const pressed = useRef(new Set<number>()); // pointers still down, for a note that waits on SOUND starting

  const noteAt = (cx: number, cy: number): number | null => {
    const el = document.elementFromPoint(cx, cy);
    const k = el instanceof Element ? el.closest<HTMLElement>("[data-note]") : null;
    return k && panel.current?.contains(k) ? Number(k.dataset.note) : null;
  };

  const release = useCallback((id: number) => {
    const n = pointers.current.get(id);
    pointers.current.delete(id);
    pressed.current.delete(id);
    if (n !== undefined) router.noteOff(n);
  }, []);

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const current = pointers.current.get(e.pointerId);
      if (current === undefined) return;
      const n = noteAt(e.clientX, e.clientY);
      if (n === null || n === current) return;
      router.noteOff(current);
      pointers.current.set(e.pointerId, n);
      router.noteOn(n);
    };
    const up = (e: PointerEvent) => release(e.pointerId);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [release]);

  async function onKeyDown(e: ReactPointerEvent<HTMLButtonElement>, note: number) {
    e.preventDefault();
    // touch captures the pointer to the first key; release it so sliding reaches the others
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    const id = e.pointerId;
    pressed.current.add(id);
    if (router.target !== "vz" && !A.running()) {
      if (!(await ensureSound())) { pressed.current.delete(id); return; }
      if (!pressed.current.has(id)) return; // let go while sound was starting
    }
    pointers.current.set(id, note);
    router.noteOn(note);
  }

  // keyboard access: Enter / Space on a focused key plays it while held
  const onKeyKey = (e: React.KeyboardEvent, note: number, down: boolean) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    if (e.repeat) return;
    if (down) router.noteOn(note); else router.noteOff(note);
  };

  const keys = Array.from({ length: KEYS }, (_, i) => low + i);
  let whiteIndex = 0;
  const placed = keys.map(n => {
    const black = BLACK.has(n % 12);
    const at = black ? whiteIndex : whiteIndex++;
    return { n, black, at };
  });
  const whiteW = 100 / WHITE_COUNT;

  return (
    <>
      <div ref={bounds} aria-hidden className="pointer-events-none fixed inset-0 z-40" />
      <motion.div
        ref={panel}
        role="region"
        aria-label="KEYBOARD"
        drag
        dragListener={false}
        dragControls={dragControls}
        dragConstraints={bounds}
        dragElastic={0}
        dragMomentum={false}
        onDragEnd={() => store.set("keys.pos", { x: Math.round(x.get()), y: Math.round(y.get()) })}
        style={{ x, y }}
        className="fixed bottom-4 left-1/2 z-40 grid w-[min(560px,calc(100vw-32px))] -translate-x-1/2 gap-2 border border-foreground bg-background p-2.5"
      >
        <div className="flex items-center gap-2">
          <span
            onPointerDown={e => dragControls.start(e)}
            className="flex flex-1 cursor-grab touch-none items-baseline gap-2 self-stretch select-none active:cursor-grabbing"
            title="DRAG TO MOVE"
          >
            <span className="tracking-[.08em]">KEYS</span>
            <span className="lead" />
            <span className={SMALL}>{noteName(low)}–{noteName(low + KEYS - 1)}</span>
          </span>
          <Info k="keys" />
          <Button onClick={onClose}>CLOSE</Button>
        </div>
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
        <div role="group" aria-label="KEYS" className="relative h-28 touch-none select-none">
          {placed.map(({ n, black, at }) => (
            <button
              key={n}
              type="button"
              data-note={n}
              aria-label={noteName(n)}
              aria-pressed={held.has(n)}
              onPointerDown={e => onKeyDown(e, n)}
              onKeyDown={e => onKeyKey(e, n, true)}
              onKeyUp={e => onKeyKey(e, n, false)}
              onContextMenu={e => e.preventDefault()}
              style={black
                ? { left: `calc(${at * whiteW}% - ${whiteW * 0.3}%)`, width: `${whiteW * 0.6}%` }
                : { left: `${at * whiteW}%`, width: `${whiteW}%` }}
              className={black
                ? "absolute top-0 z-10 h-[60%] cursor-pointer border border-foreground bg-foreground outline-none aria-pressed:bg-background focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-dashed focus-visible:outline-foreground"
                : "absolute top-0 h-full cursor-pointer border border-l-0 border-foreground bg-background outline-none first:border-l aria-pressed:bg-foreground focus-visible:outline-1 focus-visible:-outline-offset-4 focus-visible:outline-dashed focus-visible:outline-foreground"}
            >
              {!black && n % 12 === 0 && <span className={`pointer-events-none absolute inset-x-0 bottom-1 text-center ${SMALL} ${held.has(n) ? "text-background" : ""}`}>{noteName(n)}</span>}
            </button>
          ))}
        </div>
      </motion.div>
    </>
  );
}
