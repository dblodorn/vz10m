"use client";

// A small (?) button that opens a popover explaining one part of the editor in terms of the VZ-10M's
// architecture. The text lives in lib/help.ts.

import { HELP, type Help, type HelpKey } from "../lib/help";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SMALL } from "./params";

export default function Info({ k }: { k: HelpKey }) {
  const h: Help = HELP[k];
  return (
    <Popover>
      <PopoverTrigger
        aria-label={`ABOUT ${h.title}`}
        onPointerDown={e => e.stopPropagation()}
        className="inline-grid size-[16px] shrink-0 cursor-pointer place-items-center self-center border border-foreground bg-background p-0 text-[10px] leading-none text-foreground outline-none hover:bg-foreground hover:text-background aria-expanded:bg-foreground aria-expanded:text-background focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-dashed focus-visible:outline-foreground"
      >
        ?
      </PopoverTrigger>
      <PopoverContent side="bottom" align="start" aria-label={h.title} className="grid gap-2 text-[12px] leading-[1.5] normal-case tracking-normal">
        <p className="m-0 text-[11px] tracking-[.08em]">{h.title}</p>
        {h.body.map((p, i) => <p key={i} className="m-0">{p}</p>)}
        {h.editor && <p className="m-0 border-t border-dashed border-foreground pt-2"><span className={SMALL}>IN THIS EDITOR </span>{h.editor}</p>}
        {h.manual && <p className={`m-0 ${SMALL}`}>VZ-10M OWNER&apos;S MANUAL {h.manual.toUpperCase()}</p>}
      </PopoverContent>
    </Popover>
  );
}
