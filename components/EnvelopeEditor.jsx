"use client";

import { useRef, useState } from "react";
import { get } from "../lib/vz/codec";
import { VOICE_FIELD } from "../lib/vz/params";
import { FieldRow, Param, ParamSelect, SMALL } from "./params";
import { SelectItem } from "@/components/ui/select";

// An 8-step VZ envelope (a module's DCA, or the DCO pitch envelope) drawn in 1 bit.
// Each step is a segment: its RATE sets how wide it is (faster = narrower), its LEVEL where it ends.
// Drag a point: up/down sets that step's level, left/right its rate. Steps after END STEP are drawn dashed.
// `prefix` is "m1".."m8" or "dco"; `onChange(values)` takes { key: value }.

const W = 320, H = 120, PAD = 8;
const STEPS = [1, 2, 3, 4, 5, 6, 7, 8];
const MAX_W = (W - PAD * 2) / 8;
const MIN_W = 10; // the fastest step still leaves room to grab its point
const widthOf = rate => MIN_W + ((127 - rate) / 127) * (MAX_W - MIN_W);

export default function EnvelopeEditor({ id, data, prefix, onChange }) {
  const [step, setStep] = useState(1);
  const drag = useRef(null);
  const svg = useRef(null);
  const k = (s, f) => `${prefix}.env${s}.${f}`;
  const steps = STEPS.map(s => ({ s, rate: get(data, k(s, "rate")), level: get(data, k(s, "level")), sustain: get(data, k(s, "sustain")) }));
  const end = get(data, `${prefix}.envEnd`) + 1; // stored as the last step's index, 0-7 (unverified)
  let x = PAD;
  const pts = steps.map(p => { x += widthOf(p.rate); return { ...p, x, y: PAD + (1 - p.level / 127) * (H - PAD * 2) }; });
  const path = (from, to) => [{ x: PAD, y: from === 0 ? H - PAD : pts[from - 1].y }, ...pts.slice(from, to)].map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

  function toLocal(e) {
    const r = svg.current.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  }
  function onDown(e, p) {
    e.currentTarget.setPointerCapture(e.pointerId);
    setStep(p.s);
    drag.current = { s: p.s, start: toLocal(e), rate: p.rate };
  }
  function onMove(e) {
    const d = drag.current;
    if (!d) return;
    const at = toLocal(e);
    const level = Math.round((1 - (at.y - PAD) / (H - PAD * 2)) * 127);
    const rate = Math.round(d.rate - ((at.x - d.start.x) / (MAX_W - MIN_W)) * 127);
    onChange({ [k(d.s, "level")]: Math.max(0, Math.min(127, level)), [k(d.s, "rate")]: Math.max(0, Math.min(127, rate)) });
  }
  const onUp = () => { drag.current = null; };

  const sel = steps[step - 1];
  return (
    <div className="grid gap-2">
      <svg ref={svg} viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full touch-none border border-foreground select-none" onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} role="group" aria-label={`${prefix.toUpperCase()} ENVELOPE`}>
        <path d={path(0, end)} fill="none" stroke="currentColor" strokeWidth="1" />
        {end < 8 && <path d={path(end, 8).replace(/^M[^L]*/, `M${pts[end - 1].x.toFixed(1)},${pts[end - 1].y.toFixed(1)}`)} fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="2 3" />}
        {pts.map(p => (
          <g key={p.s}>
            {p.sustain === 1 && <line x1={p.x} x2={p.x} y1={PAD} y2={H - PAD} stroke="currentColor" strokeDasharray="1 2" />}
            <rect
              x={p.x - 4} y={p.y - 4} width="8" height="8"
              fill={p.s === step ? "currentColor" : "var(--background)"} stroke="currentColor"
              className="cursor-grab active:cursor-grabbing"
              onPointerDown={e => onDown(e, p)}
            />
          </g>
        ))}
      </svg>
      <div role="tablist" aria-label="STEP" className={`grid grid-cols-8 border border-foreground ${SMALL}`}>
        {STEPS.map(s => (
          <button key={s} role="tab" aria-selected={s === step} onClick={() => setStep(s)}
            className="cursor-pointer border-l border-foreground bg-background py-1 text-foreground first:border-l-0 hover:bg-foreground hover:text-background aria-selected:bg-foreground aria-selected:text-background focus-visible:outline-1 focus-visible:-outline-offset-4 focus-visible:outline-dashed">
            {s}{steps[s - 1].sustain ? "S" : ""}{s === end ? "E" : ""}
          </button>
        ))}
      </div>
      <FieldRow id={`${id}-rate`} field={VOICE_FIELD[k(step, "rate")]} label={`STEP ${step} RATE`} value={sel.rate} onChange={v => onChange({ [k(step, "rate")]: v })} />
      <FieldRow id={`${id}-level`} field={VOICE_FIELD[k(step, "level")]} label={`STEP ${step} LEVEL`} value={sel.level} onChange={v => onChange({ [k(step, "level")]: v })} />
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        <FieldRow field={VOICE_FIELD[k(step, "sustain")]} label={`SUSTAIN AT STEP ${step}`} value={sel.sustain}
          onChange={v => onChange(Object.fromEntries(STEPS.map(s => [k(s, "sustain"), v && s === step ? 1 : 0])))} />
        <FieldRow field={VOICE_FIELD[k(step, "velRate")]} label="VELOCITY RATE" value={get(data, k(step, "velRate"))} onChange={v => onChange({ [k(step, "velRate")]: v })} />
      </div>
      <Param id={`${id}-end`} label="END STEP" value={end}>
        <ParamSelect id={`${id}-end`} value={String(end)} display={String(end)} onChange={v => onChange({ [`${prefix}.envEnd`]: Number(v) - 1 })}>
          {STEPS.map(s => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}
        </ParamSelect>
      </Param>
    </div>
  );
}
