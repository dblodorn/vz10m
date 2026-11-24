"use client";

// An 8-step VZ envelope (a module's DCA, or the DCO pitch envelope): the package's EnvelopeEditor in its "step"
// layout, mapped onto the voice's fields. Each step is a segment: its RATE sets how wide it is (faster = narrower),
// its LEVEL where it ends. Steps after END STEP are drawn dashed; the sustain step is marked with a dotted line.
// `prefix` is "m1".."m8" or "dco"; `onChange(values)` takes { key: value }.

import { EnvelopeEditor as Envelope, SelectItem } from "@dblodorn/sound-ui";
import { voiceField } from "@dblodorn/casio-vz-engine";
import { get } from "../lib/vz/codec";
import { FieldRow, Param, ParamSelect } from "./params";

const STEPS = [1, 2, 3, 4, 5, 6, 7, 8];
// the VZ's drawing: taller than the package's default, steps 10–38 wide so all eight fit unscaled
const SIZES = "[--sound-envelope-height:120px] [--sound-envelope-inset:8px] [--sound-envelope-segment-min:10px] [--sound-envelope-segment-max:38px]";

interface Props {
  id: string;
  data: Uint8Array;
  prefix: string;
  onChange: (values: Record<string, number>) => void;
}

export default function EnvelopeEditor({ id, data, prefix, onChange }: Props) {
  const k = (s: number, f: string): string => `${prefix}.env${s}.${f}`;
  const end = get(data, `${prefix}.envEnd`) + 1; // stored as the last step's index, 0-7 (unverified)
  const stages = STEPS.map(s => ({ rate: get(data, k(s, "rate")), level: get(data, k(s, "level")) }));
  const sus = STEPS.map(s => get(data, k(s, "sustain")));
  const sustain = sus.indexOf(1);
  const rate = voiceField(k(1, "rate")), level = voiceField(k(1, "level"));

  return (
    <Envelope
      id={id} label={`${prefix.toUpperCase()} ENVELOPE`} layout="step" className={SIZES}
      stages={stages} rateRange={[rate.min, rate.max]} levelRange={[level.min, level.max]}
      sustain={sustain < 0 ? undefined : sustain} end={end - 1}
      onChange={(i, c) => onChange("rate" in c ? { [k(i + 1, "rate")]: c.rate } : { [k(i + 1, "level")]: c.level })}
      rateLabel={i => `STEP ${i + 1} RATE`} levelLabel={i => `STEP ${i + 1} LEVEL`}
      stepLabel={i => `${i + 1}${sus[i] ? "S" : ""}${i + 1 === end ? "E" : ""}`}
      extra={i => {
        const step = i + 1;
        return (
          <>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              <FieldRow id={`${id}-sus`} field={voiceField(k(step, "sustain"))} label={`SUSTAIN AT STEP ${step}`} value={sus[i]!}
                onChange={v => onChange(Object.fromEntries(STEPS.map(s => [k(s, "sustain"), v && s === step ? 1 : 0])))} />
              <FieldRow id={`${id}-vr`} field={voiceField(k(step, "velRate"))} label="VELOCITY RATE" value={get(data, k(step, "velRate"))} onChange={v => onChange({ [k(step, "velRate")]: v })} />
            </div>
            <Param id={`${id}-end`} label="END STEP" value={end}>
              <ParamSelect id={`${id}-end`} value={String(end)} display={String(end)} onChange={v => onChange({ [`${prefix}.envEnd`]: Number(v) - 1 })}>
                {STEPS.map(s => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}
              </ParamSelect>
            </Param>
          </>
        );
      }}
    />
  );
}
