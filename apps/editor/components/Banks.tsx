"use client";

// The BANKS tab: 64-slot banks built from voices, kept on this device in SQLite (lib/banks/, through the worker in
// worker/banks-worker.ts). Loaded with next/dynamic when the tab is first opened, which is also when the worker and
// sqlite3.wasm load. Export writes the filled slots, in order, as single-voice dumps in one .syx file; the VZ's own
// bulk format isn't documented, so a bank can't be sent to the VZ's memory in one go.

import { useCallback, useEffect, useRef, useState } from "react";
import * as Bc from "../lib/banks/client";
import { SLOTS, NAME_MAX, type Bank, type BankSummary } from "../lib/banks/db";
import * as V from "../lib/vz/codec";
import { download, fileName } from "../lib/files";
import { NOTE, Param, ParamSelect, ROW, SMALL } from "./params";
import { Button } from "@/components/ui/button";
import { SelectItem } from "@/components/ui/select";

const slotLabel = (i: number): string => String(i + 1).padStart(2, "0");

interface Props {
  voice: Uint8Array;
  active: string | null;
  onActive: (id: string | null) => void;
  onOpen: (bytes: Uint8Array) => void;
  canSend: boolean;
  onSend: (list: Uint8Array[]) => void;
}

export default function Banks({ voice, active, onActive, onOpen, canSend, onSend }: Props) {
  const [persistent, setPersistent] = useState<boolean | null>(null);
  const [failed, setFailed] = useState(false);
  const [banks, setBanks] = useState<BankSummary[]>([]);
  const [bank, setBank] = useState<Bank | null>(null);
  const [slot, setSlot] = useState(0);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"delete" | "clear" | null>(null);
  const [msg, setMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // re-read the list and the chosen bank after every change
  const refresh = useCallback(async (choose?: string | null) => {
    const list = await Bc.call("list");
    setBanks(list);
    const id = choose !== undefined ? choose : active;
    const pick = id && list.some(b => b.id === id) ? id : list[0]?.id ?? null;
    if (pick !== active) onActive(pick);
    setBank(pick ? await Bc.call("get", pick) : null);
  }, [active, onActive]);

  useEffect(() => {
    let live = true;
    Bc.call("open")
      .then(r => { if (live) setPersistent(r.persistent); return refresh(); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
    // once, on mount: `refresh` changes with `active`, and the later changes call it themselves
  }, []);

  // every change goes through here: run it, re-read, report
  async function change(work: () => Promise<unknown>, done: string, choose?: string | null) {
    setConfirm(null);
    try { await work(); await refresh(choose); setMsg(done); }
    catch (e) { setMsg(`COULD NOT CHANGE THE BANK${e instanceof Error && e.message ? `: ${e.message.toUpperCase()}` : ""}.`); }
  }

  async function newBank() {
    const n = banks.length + 1;
    let id = "";
    await change(async () => { id = await Bc.call("create", `BANK ${n}`, []); }, `MADE BANK ${n}.`, null);
    if (id) await refresh(id);
  }

  async function onFiles(files: File[]) {
    const voices: Uint8Array[] = [];
    let skipped = 0;
    for (const f of files) {
      const { items, errors } = V.fromSyx(new Uint8Array(await f.arrayBuffer()));
      items.forEach(i => (i.kind === "voice" ? voices.push(i.data) : skipped++));
      skipped += errors.length;
    }
    if (!voices.length) { setMsg("NO VOICES IN THAT FILE."); return; }
    const base = (files[0]?.name ?? "IMPORTED").replace(/\.syx$/i, "").slice(0, NAME_MAX - 3);
    const chunks = Array.from({ length: Math.ceil(voices.length / SLOTS) }, (_, k) => voices.slice(k * SLOTS, (k + 1) * SLOTS));
    let first = "";
    await change(async () => {
      for (const [k, chunk] of chunks.entries()) {
        const id = await Bc.call("create", chunks.length > 1 ? `${base} ${k + 1}` : base, chunk);
        first ||= id;
      }
    }, `IMPORTED ${voices.length} VOICE${voices.length === 1 ? "" : "S"} INTO ${chunks.length} BANK${chunks.length === 1 ? "" : "S"}${skipped ? `; SKIPPED ${skipped} OTHER OR DAMAGED DUMP${skipped === 1 ? "" : "S"}` : ""}.`);
    if (first) await refresh(first);
  }

  if (failed) return <p className={NOTE}>BANKS COULDN&apos;T START IN THIS BROWSER.</p>;
  if (persistent === null) return <p className={NOTE}>LOADING…</p>;

  const filled = bank ? bank.slots.flatMap(s => (s ? [s] : [])) : [];
  const current = bank?.slots[slot] ?? null;
  const name = bank?.name ?? "";

  return (
    <div className="grid gap-3">
      {!persistent && (
        <p role="alert" className={NOTE}>
          THESE BANKS WON&apos;T BE KEPT: THEY&apos;RE OPEN IN ANOTHER TAB, OR THIS BROWSER CAN&apos;T STORE THEM. CLOSE OTHER VZ10M TABS AND RELOAD.
        </p>
      )}
      <div className={ROW + " mt-0"}>
        <Button onClick={newBank}>NEW BANK</Button>
        <Button onClick={() => fileRef.current?.click()}>IMPORT .SYX</Button>
        <input ref={fileRef} type="file" accept=".syx,application/octet-stream" multiple hidden onChange={e => { onFiles([...(e.target.files ?? [])]); e.target.value = ""; }} />
      </div>
      {msg && <p role="status" className={NOTE}>{msg}</p>}

      {!bank ? <p className={NOTE}>No banks yet. NEW BANK starts an empty one; IMPORT .SYX makes one from a dump file.</p> : (
        <>
          <Param id="bank" label="BANK" value={`${filled.length} / ${SLOTS}`}>
            <ParamSelect id="bank" value={bank.id} display={name} onChange={id => { setSlot(0); setRenaming(null); refresh(id); }}>
              {banks.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </ParamSelect>
          </Param>
          {renaming !== null ? (
            <form className={ROW + " mt-0"} onSubmit={e => { e.preventDefault(); const n = renaming; setRenaming(null); change(() => Bc.call("rename", bank.id, n), "RENAMED."); }}>
              <input
                aria-label="BANK NAME" autoFocus maxLength={NAME_MAX} value={renaming} onChange={e => setRenaming(e.target.value.toUpperCase())}
                onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); setRenaming(null); } }}
                className="h-8 min-w-0 flex-1 border border-foreground bg-background px-2 uppercase outline-none focus-visible:outline-1 focus-visible:outline-offset-3 focus-visible:outline-dashed touch:text-[16px]"
              />
              <Button type="submit">SAVE NAME</Button>
              <Button type="button" onClick={() => setRenaming(null)}>CANCEL</Button>
            </form>
          ) : (
            <div className={ROW + " mt-0"}>
              <Button onClick={() => setRenaming(name)}>RENAME</Button>
              <Button disabled={!filled.length} onClick={() => download(V.toSyx(filled), fileName(name))}>EXPORT .SYX</Button>
              <Button
                aria-pressed={confirm === "delete"}
                onBlur={() => setConfirm(c => (c === "delete" ? null : c))}
                onClick={() => confirm === "delete" ? change(() => Bc.call("remove", bank.id), `DELETED ${name}.`, null) : setConfirm("delete")}
              >{confirm === "delete" ? "CONFIRM DELETE BANK" : "DELETE BANK"}</Button>
            </div>
          )}

          <div role="group" aria-label={`SLOT ${slotLabel(slot)}`} className="grid gap-1.5 border border-foreground p-2">
            <div className="flex items-baseline gap-2">
              <span className="tracking-[.08em]">SLOT {slotLabel(slot)}</span>
              <span className="lead" />
              <span>{current ? V.getName(current) || "UNTITLED" : "EMPTY"}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Button onClick={() => change(() => Bc.call("setSlot", bank.id, slot, voice), `PUT ${V.getName(voice) || "UNTITLED"} IN SLOT ${slotLabel(slot)}.`)}>PUT CURRENT</Button>
              <Button disabled={!current} onClick={() => current && onOpen(current)}>OPEN</Button>
              <Button disabled={!current || !canSend} onClick={() => current && onSend([current])}>SEND</Button>
              <Button disabled={slot === 0} aria-label="MOVE UP" onClick={() => { const to = slot - 1; change(() => Bc.call("swap", bank.id, slot, to), `MOVED TO SLOT ${slotLabel(to)}.`).then(() => setSlot(to)); }}>▴</Button>
              <Button disabled={slot === SLOTS - 1} aria-label="MOVE DOWN" onClick={() => { const to = slot + 1; change(() => Bc.call("swap", bank.id, slot, to), `MOVED TO SLOT ${slotLabel(to)}.`).then(() => setSlot(to)); }}>▾</Button>
              <Button
                disabled={!current} aria-pressed={confirm === "clear"}
                onBlur={() => setConfirm(c => (c === "clear" ? null : c))}
                onClick={() => confirm === "clear" ? change(() => Bc.call("setSlot", bank.id, slot, null), `EMPTIED SLOT ${slotLabel(slot)}.`) : setConfirm("clear")}
              >{confirm === "clear" ? "CONFIRM EMPTY" : "EMPTY"}</Button>
            </div>
          </div>

          <ol aria-label={`SLOTS OF ${name}`} className="m-0 grid list-none grid-cols-1 gap-0 p-0 sm:grid-cols-2 sm:gap-x-3">
            {bank.slots.map((s, i) => (
              <li key={i}>
                <button
                  type="button" aria-pressed={i === slot} onClick={() => { setSlot(i); setConfirm(null); }}
                  className="flex w-full items-baseline gap-2 border-b border-dashed border-foreground px-1 py-1 text-left hover:bg-foreground hover:text-background aria-pressed:bg-foreground aria-pressed:text-background focus-visible:outline-1 focus-visible:-outline-offset-2 focus-visible:outline-dashed focus-visible:outline-foreground"
                >
                  <span className={SMALL}>{slotLabel(i)}</span>
                  <span className="truncate">{s ? V.getName(s) || "UNTITLED" : "—"}</span>
                </button>
              </li>
            ))}
          </ol>
          <p className={NOTE}>EXPORT .SYX writes the filled slots in order, one voice dump each; empty slots are left out. SEND puts one voice in the VZ&apos;s compare/recall area.</p>
        </>
      )}
    </div>
  );
}
