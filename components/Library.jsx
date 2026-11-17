"use client";

import { useRef, useState } from "react";
import * as V from "../lib/vz/codec";
import { entry, fromB64 } from "../lib/store";
import { NOTE, ROW, SMALL } from "./params";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

// The local library: voices and operations kept in this browser, imported from or exported to .syx files.
// Loaded with next/dynamic the first time LIBRARY is pressed.

const date = iso => iso.slice(0, 10);

function download(bytes, filename) {
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/octet-stream" }));
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const fileName = name => (name.trim() || "VZ").replace(/[^\w -]/g, "").replace(/\s+/g, "-") + ".syx";

export default function Library({ open, onOpenChange, library, updateLibrary, voice, onOpen, canSend, onSend }) {
  const [msg, setMsg] = useState("");
  const [query, setQuery] = useState("");
  const [confirming, setConfirming] = useState(null); // id awaiting a second press of DELETE
  const fileRef = useRef(null);

  function saveCurrent() {
    const name = V.getName(voice) || "UNTITLED";
    updateLibrary(list => [entry("voice", name, voice), ...list]);
    setMsg(`SAVED ${name}.`);
  }

  async function onFiles(files) {
    let added = 0, bad = 0;
    const items = [];
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
      <SheetContent aria-describedby="lib-desc" className="w-[min(440px,100vw)]">
        <SheetHeader>
          <SheetTitle>LIBRARY</SheetTitle>
          <span className="lead" />
          <SheetClose asChild><Button>CLOSE</Button></SheetClose>
        </SheetHeader>
        <SheetDescription id="lib-desc" className={NOTE}>Kept in this browser. Import and export .syx files to move dumps between machines.</SheetDescription>
        <div className={ROW + " mt-0"}>
          <Button onClick={saveCurrent}>SAVE CURRENT</Button>
          <Button onClick={() => fileRef.current && fileRef.current.click()}>IMPORT .SYX</Button>
          <Button disabled={!library.length} onClick={() => download(V.toSyx(library.map(e => fromB64(e.data))), "vz10m-library.syx")}>EXPORT ALL</Button>
          <input ref={fileRef} type="file" accept=".syx,application/octet-stream" multiple hidden onChange={e => { onFiles([...e.target.files]); e.target.value = ""; }} />
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
      </SheetContent>
    </Sheet>
  );
}
