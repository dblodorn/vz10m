"use client";

// The parameter-row vocabulary, as windchime's Chime.jsx defines it: LABEL ....... value, with the control beneath.
// Controls are named by `${id}-label`, the label text alone.

import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";

export const NOTE = "m-0 max-w-[60ch] text-[11px]";
export const ROW = "mt-2 flex flex-wrap items-center gap-2.5";
export const SMALL = "text-[10px] tracking-[.08em]";

export function Param({ id, label, value, children }) {
  return (
    <div>
      <div className="flex items-baseline gap-2 tabular-nums">
        <span id={`${id}-label`} className="tracking-[.08em]">{label}</span>
        <span className="lead" />
        <span className="whitespace-nowrap">{value}</span>
      </div>
      {children}
    </div>
  );
}

export function ParamSlider({ id, value, onChange, ...range }) {
  return <Slider id={id} value={[value]} onValueChange={([v]) => onChange(v)} aria-labelledby={`${id}-label`} {...range} />;
}

// `display` is the current choice's text: Radix only fills SelectValue on the client, so pass it in for the server render
export function ParamSelect({ id, value, display, onChange, disabled, children }) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger id={id} aria-labelledby={`${id}-label`}><SelectValue>{display}</SelectValue></SelectTrigger>
      <SelectContent>{children}</SelectContent>
    </Select>
  );
}

export function Check({ checked, onChange, children }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-[11px] tracking-[.04em]">
      <Checkbox checked={checked} onCheckedChange={v => onChange(v === true)} /> {children}
    </label>
  );
}

// A row for one field of params.js. `get` / `set` read and write the field by key.
export function FieldRow({ id, field, value, onChange, label = field.label }) {
  if (field.options) {
    return (
      <Param id={id} label={label} value={field.options[value] ?? value}>
        <ParamSelect id={id} value={String(value)} display={field.options[value] ?? String(value)} onChange={v => onChange(Number(v))}>
          {field.options.slice(0, field.max + 1).map((o, i) => <SelectItem key={o} value={String(i)}>{o}</SelectItem>)}
        </ParamSelect>
      </Param>
    );
  }
  if (field.max === 1) {
    return <Check checked={value === 1} onChange={v => onChange(v ? 1 : 0)}>{label}</Check>;
  }
  return (
    <Param id={id} label={label} value={field.display ? `${field.display(value)}  (${value})` : value}>
      <ParamSlider id={id} value={value} onChange={onChange} min={field.min} max={field.max} step={1} />
    </Param>
  );
}
