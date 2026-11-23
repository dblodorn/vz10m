"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import * as V from "../lib/vz/codec";
import * as Bc from "../lib/banks/client";
import { download, fileName } from "../lib/files";
import { RESOURCES } from "../lib/resources";
import { entry, fromB64, store, type Entry } from "../lib/store";
import { NOTE, ROW, SMALL } from "./params";
import Info from "./Info";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

// The LIBRARY sheet, in four tabs: LOCAL (voices and operations kept in this browser, imported from or exported
// to .syx files), SHARED (the public list, components/Shared.tsx), BANKS (64-slot banks on this device,
// components/Banks.tsx) and COLOPHON (the typeface's credit, then outside links from lib/resources.ts). Loaded with next/dynamic the first time LIBRARY is pressed; SHARED and BANKS load their
// own code (Relay, SQLite) only when their tab is first shown. ADD TO BANK, in LOCAL and SHARED, fills the first
// empty slot of the bank last chosen in BANKS.

const Shared = dynamic(() => import("./Shared"), { ssr: false, loading: () => <p className={NOTE}>LOADING…</p> });
const Banks = dynamic(() => import("./Banks"), { ssr: false, loading: () => <p className={NOTE}>LOADING…</p> });

const TABS = [{ value: "local", label: "LOCAL" }, { value: "shared", label: "SHARED" }, { value: "banks", label: "BANKS" }, { value: "colophon", label: "COLOPHON" }] as const;
type Tab = (typeof TABS)[number]["value"];

const date = (iso: string): string => iso.slice(0, 10);

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  library: Entry[];
  updateLibrary: (fn: (list: Entry[]) => Entry[]) => void;
  voice: Uint8Array;
  onOpen: (bytes: Uint8Array) => void;
  canSend: boolean;
  onSend: (list: Uint8Array[]) => void;
}

export default function Library({ open, onOpenChange, library, updateLibrary, voice, onOpen, canSend, onSend }: Props) {
  const [msg, setMsg] = useState("");
  const [query, setQuery] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null); // id awaiting a second press of DELETE
  const fileRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<Tab>("local");
  const [activeBank, setActiveBank] = useState<string | null>(null);

  useEffect(() => {
    const saved = store.get<string>("library.tab", "local");
    const t = saved === "resources" ? "colophon" : saved; // the tab's old name
    setTab(TABS.some(x => x.value === t) ? (t as Tab) : "local");
    setActiveBank(store.get<string | null>("banks.active", null));
  }, []);
  const chooseTab = (t: Tab) => { setTab(t); setMsg(""); store.set("library.tab", t); };
  const chooseBank = (id: string | null) => { setActiveBank(id); store.set("banks.active", id); };

  async function addToBank(bytes: Uint8Array) {
    if (!activeBank) return;
    const name = V.getName(bytes) || "UNTITLED";
    try {
      const slot = await Bc.call("add", activeBank, bytes);
      setMsg(slot < 0 ? "THAT BANK IS FULL. CHOOSE ANOTHER IN BANKS." : `ADDED ${name} TO SLOT ${String(slot + 1).padStart(2, "0")}.`);
    } catch {
      setMsg("COULD NOT ADD TO THE BANK. OPEN BANKS AND CHOOSE ONE.");
    }
  }

  function saveCurrent() {
    const name = V.getName(voice) || "UNTITLED";
    updateLibrary(list => [entry("voice", name, voice), ...list]);
    setMsg(`SAVED ${name}.`);
  }

  async function onFiles(files: File[]) {
    let added = 0, bad = 0;
    const items: Entry[] = [];
    for (const f of files) {
      const { items: found, errors } = V.fromSyx(new Uint8Array(await f.arrayBuffer()));
      found.forEach(i => items.push(entry(i.kind, i.name || "UNTITLED", i.data)));
      added += found.length; bad += errors.length;
    }
    if (items.length) updateLibrary(list => [...items, ...list]);
    setMsg(`IMPORTED ${added} DUMP${added === 1 ? "" : "S"}${bad ? `; ${bad} DAMAGED OR NOT VZ, SKIPPED` : ""}.`);
  }

  const q = query.trim().toUpperCase();
  const shown = q ? library.filter(e => e.name.includes(q)) : library;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent aria-describedby="lib-desc" className="w-[min(480px,100vw)]">
        <SheetHeader>
          <SheetTitle>LIBRARY</SheetTitle>
          <Info k="library" />
          <span className="lead" />
          <SheetClose asChild><Button>CLOSE</Button></SheetClose>
        </SheetHeader>
        <div role="tablist" aria-label="LIBRARY" className="flex flex-wrap gap-1.5">
          {TABS.map(t => (
            <Button key={t.value} role="tab" id={`lib-tab-${t.value}`} aria-controls={`lib-panel-${t.value}`} aria-selected={tab === t.value}
              className="aria-selected:bg-foreground aria-selected:text-background" onClick={() => chooseTab(t.value)}>{t.label}</Button>
          ))}
        </div>
        <SheetDescription id="lib-desc" className={NOTE}>
          {tab === "local" ? "Kept in this browser. Import and export .syx files to move dumps between machines."
            : tab === "shared" ? "Voices anyone can open. What you share here is public, and names are checked before they're listed."
            : tab === "banks" ? "Banks of 64 voices, kept on this device only. Build them from the voice you're editing, your library and the shared list, then export them as .syx."
            : "The typeface and the design system, then manuals, patch archives and tools elsewhere on the web. They open in a new tab. Casio's RC-100 to RC-140 ROM card voices are already in SHARED."}
        </SheetDescription>
        {tab === "colophon" && (
          <ul role="tabpanel" id="lib-panel-colophon" aria-labelledby="lib-tab-colophon" className="m-0 grid list-none p-0">
            <li className="grid gap-1 border-t border-dashed border-foreground py-2">
              <a href="https://aisforfonts.com/knif/" target="_blank" rel="noopener noreferrer"
                className="w-fit tracking-[.06em] text-foreground underline underline-offset-3 outline-none focus-visible:outline-1 focus-visible:outline-offset-3 focus-visible:outline-dashed">
                TYPE: KNIF MONO BY A IS FOR FONTS
              </a>
              <p className={NOTE}>The editor is set in Knif Mono, licensed from the foundry A is for fonts.</p>
            </li>
            <li className="grid gap-1 border-t border-dashed border-foreground py-2">
              <a href="https://soundsystem.dmbk.io/" target="_blank" rel="noopener noreferrer"
                className="w-fit tracking-[.06em] text-foreground underline underline-offset-3 outline-none focus-visible:outline-1 focus-visible:outline-offset-3 focus-visible:outline-dashed">
                SOUND DESIGN SYSTEM
              </a>
              <p className={NOTE}>The controls, type and colors this editor shares with Chime and the DX7 editor.</p>
            </li>
            {RESOURCES.map(r => (
              <li key={r.url} className="grid gap-1 border-t border-dashed border-foreground py-2">
                <a href={r.url} target="_blank" rel="noopener noreferrer"
                  className="w-fit tracking-[.06em] text-foreground underline underline-offset-3 outline-none focus-visible:outline-1 focus-visible:outline-offset-3 focus-visible:outline-dashed">
                  {r.name}
                </a>
                <p className={NOTE}>{r.text}</p>
              </li>
            ))}
          </ul>
        )}
        {(tab === "shared" || tab === "banks") && (
          <div role="tabpanel" id={`lib-panel-${tab}`} aria-labelledby={`lib-tab-${tab}`} className="grid gap-3">
            {tab === "shared"
              ? <>{msg && <p role="status" className={NOTE}>{msg}</p>}<Shared voice={voice} onOpen={onOpen} onAddToBank={activeBank ? addToBank : null} /></>
              : <Banks voice={voice} active={activeBank} onActive={chooseBank} onOpen={onOpen} canSend={canSend} onSend={onSend} />}
          </div>
        )}
        {tab === "local" && <div role="tabpanel" id="lib-panel-local" aria-labelledby="lib-tab-local" className="grid gap-3.5">
        <div className={ROW + " mt-0"}>
          <Button onClick={saveCurrent}>SAVE CURRENT</Button>
          <Button onClick={() => fileRef.current && fileRef.current.click()}>IMPORT .SYX</Button>
          <Button disabled={!library.length} onClick={() => download(V.toSyx(library.map(e => fromB64(e.data))), "vz10m-library.syx")}>EXPORT ALL</Button>
          <input ref={fileRef} type="file" accept=".syx,application/octet-stream" multiple hidden onChange={e => { onFiles([...(e.target.files ?? [])]); e.target.value = ""; }} />
        </div>
        {msg && <p role="status" className={NOTE}>{msg}</p>}
        <label className="flex items-center gap-2">
          <span id="lib-search-label" className={SMALL}>SEARCH</span>
          <input type="search" aria-labelledby="lib-search-label" value={query} onChange={e => setQuery(e.target.value)}
            className="h-8 min-w-0 flex-1 border border-foreground bg-background px-2 uppercase outline-none focus-visible:outline-1 focus-visible:outline-offset-3 focus-visible:outline-dashed touch:text-[16px]" />
        </label>
        <ul className="m-0 grid list-none p-0">
          {shown.map(e => (
            <li key={e.id} className="grid gap-1 border-t border-dashed border-foreground py-2">
              <div className="flex items-baseline gap-2">
                <span className="tracking-[.06em]">{e.name}</span>
                <span className="lead" />
                <span className={SMALL}>{e.kind.toUpperCase()} · {date(e.savedAt)}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {e.kind === "voice" && <Button onClick={() => onOpen(fromB64(e.data))}>OPEN</Button>}
                {e.kind === "voice" && activeBank && <Button onClick={() => addToBank(fromB64(e.data))}>ADD TO BANK</Button>}
                <Button disabled={!canSend} onClick={() => onSend([fromB64(e.data)])}>SEND</Button>
                <Button onClick={() => download(V.toSysex(fromB64(e.data)), fileName(e.name))}>.SYX</Button>
                <Button
                  aria-pressed={confirming === e.id}
                  onClick={() => {
                    if (confirming !== e.id) { setConfirming(e.id); return; }
                    updateLibrary(list => list.filter(x => x.id !== e.id));
                    setConfirming(null);
                    setMsg(`DELETED ${e.name}.`);
                  }}
                  onBlur={() => setConfirming(c => (c === e.id ? null : c))}
                >{confirming === e.id ? "CONFIRM DELETE" : "DELETE"}</Button>
              </div>
            </li>
          ))}
        </ul>
        {!library.length && <p className={NOTE}>Nothing saved yet. SAVE CURRENT keeps the voice you&apos;re editing; IMPORT .SYX reads VZ-1 / VZ-10M dump files.</p>}
        {library.length > 0 && !shown.length && <p className={NOTE}>NO MATCH FOR {q}</p>}
        </div>}
      </SheetContent>
    </Sheet>
  );
}
