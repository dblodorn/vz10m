"use client";

// The SHARED tab: the public list of voices anyone has saved through the dmbk GraphQL API (lib/relay/environment.ts
// → app/api/graphql), and saving, renaming, updating and deleting your own. "Yours" means saved with this
// browser's device key (lib/device.ts); the API marks them with `yours(creatorKey)`. Loaded with next/dynamic when
// the tab is first opened, so Relay and every request stay off the page until then.

import { Component, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { ConnectionHandler, RelayEnvironmentProvider, graphql, useFragment, useLazyLoadQuery, useMutation, usePaginationFragment } from "react-relay";
import type { Environment, RecordSourceSelectorProxy } from "relay-runtime";
import { ApiError, createRelayEnvironment } from "../lib/relay/environment";
import * as D from "../lib/device";
import * as V from "../lib/vz/codec";
import { isNameAllowed } from "../lib/vz/names";
import { VOICE_BYTES } from "../lib/vz/sysex";
import { fromB64, toB64 } from "../lib/store";
import { NOTE, ROW, SMALL } from "./params";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { SharedQuery } from "./__generated__/SharedQuery.graphql";
import type { SharedPaginationQuery } from "./__generated__/SharedPaginationQuery.graphql";
import type { Shared_list$key } from "./__generated__/Shared_list.graphql";
import type { Shared_row$data, Shared_row$key } from "./__generated__/Shared_row.graphql";
import type { SharedSaveMutation, SharedSaveMutation$data } from "./__generated__/SharedSaveMutation.graphql";
import type { SharedUpdateMutation } from "./__generated__/SharedUpdateMutation.graphql";
import type { SharedDeleteMutation } from "./__generated__/SharedDeleteMutation.graphql";

const PAGE = 20;
const NAME_MAX = 12;

// one store for the page's lifetime, so going back to the tab shows the list at once (and refetches it)
let environment: Environment | null = null;
const relayEnvironment = () => (environment ??= createRelayEnvironment());

const ListQuery = graphql`
  query SharedQuery($count: Int, $cursor: String, $creatorKey: String, $search: String, $yoursKey: String!) {
    ...Shared_list @arguments(count: $count, cursor: $cursor, creatorKey: $creatorKey, search: $search, yoursKey: $yoursKey)
  }
`;

const ListFragment = graphql`
  fragment Shared_list on Query
  @refetchable(queryName: "SharedPaginationQuery")
  @argumentDefinitions(
    count: { type: "Int", defaultValue: 20 }
    cursor: { type: "String" }
    creatorKey: { type: "String" }
    search: { type: "String" }
    yoursKey: { type: "String!" }
  ) {
    dmbkSoundVzVoices(first: $count, after: $cursor, creatorKey: $creatorKey, search: $search)
    @connection(key: "Shared_dmbkSoundVzVoices", filters: ["creatorKey", "search"]) {
      __id
      edges {
        node {
          id
          ...Shared_row @arguments(yoursKey: $yoursKey)
        }
      }
    }
  }
`;

const RowFragment = graphql`
  fragment Shared_row on VzVoice @argumentDefinitions(yoursKey: { type: "String!" }) {
    id
    name
    data
    createdAt
    updatedAt
    yours(creatorKey: $yoursKey)
  }
`;

const SaveMutation = graphql`
  mutation SharedSaveMutation($input: DmbkSoundSaveVzVoiceInput!, $yoursKey: String!) {
    dmbkSoundSaveVzVoice(input: $input) {
      created
      vzVoiceEdge {
        cursor
        node {
          id
          name
          ...Shared_row @arguments(yoursKey: $yoursKey)
        }
      }
    }
  }
`;

const UpdateMutation = graphql`
  mutation SharedUpdateMutation($input: DmbkSoundUpdateVzVoiceInput!, $yoursKey: String!) {
    dmbkSoundUpdateVzVoice(input: $input) {
      vzVoice {
        id
        name
        ...Shared_row @arguments(yoursKey: $yoursKey)
      }
    }
  }
`;

const DeleteMutation = graphql`
  mutation SharedDeleteMutation($input: DmbkSoundDeleteVzVoiceInput!, $connections: [ID!]!) {
    dmbkSoundDeleteVzVoice(input: $input) {
      deletedVzVoiceId @deleteEdge(connections: $connections)
    }
  }
`;

// What the person can do about an API or network error, in the page's voice.
function problem(err: Error, doing: string): string {
  const code = err instanceof ApiError ? err.code : "";
  if (code === "RATE_LIMITED") return "TOO MANY CHANGES. TRY AGAIN LATER.";
  if (code === "BAD_USER_INPUT") return err.message.toUpperCase();
  if (code === "FORBIDDEN") return "ONLY THE DEVICE THAT SAVED THIS VOICE CAN CHANGE IT.";
  if (code === "NOT_FOUND") return "THAT VOICE IS GONE.";
  return `COULD NOT ${doing}.`;
}
const refusedName = (name: string) => `"${name}" ISN'T ALLOWED IN THE SHARED LIST. RENAME THE VOICE FIRST.`;

const date = (iso: string): string => iso.slice(0, 10);
const voiceOf = (data: string): Uint8Array | null => {
  try { const b = fromB64(data); return b.length === VOICE_BYTES ? b : null; } catch { return null; }
};

// The saved voice goes on top of the list being shown, unless that list already has it (a repeat save) or
// is a search the name might not match.
function prependSaved(connectionId: string | null, search: boolean) {
  return (store: RecordSourceSelectorProxy<SharedSaveMutation$data>) => {
    if (search) return;
    const payload = store.getRootField("dmbkSoundSaveVzVoice");
    const edge = payload?.getLinkedRecord("vzVoiceEdge");
    const node = edge?.getLinkedRecord("node");
    const conn = connectionId ? store.get(connectionId) : null;
    if (!edge || !node || !conn) return;
    const edges = conn.getLinkedRecords("edges") || [];
    if (edges.some(e => e?.getLinkedRecord("node")?.getDataID() === node.getDataID())) return;
    const built = ConnectionHandler.buildConnectionEdge(store, conn, edge);
    if (built) ConnectionHandler.insertEdgeBefore(conn, built);
  };
}

interface RowActions {
  voice: Uint8Array;
  yoursKey: string;
  connectionId: string;
  onOpen: (bytes: Uint8Array) => void;
  onAddToBank: ((bytes: Uint8Array) => void) | null;
  say: (msg: string) => void;
}

function Row({ row, voice, yoursKey, connectionId, onOpen, onAddToBank, say }: RowActions & { row: Shared_row$data }) {
  const [commitUpdate, updating] = useMutation<SharedUpdateMutation>(UpdateMutation);
  const [commitDelete, deleting] = useMutation<SharedDeleteMutation>(DeleteMutation);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"update" | "delete" | null>(null);
  const bytes = voiceOf(row.data);
  const busy = updating || deleting;

  function update(data: Uint8Array, doing: string, done: string) {
    const name = V.getName(data);
    if (!isNameAllowed(name)) { say(refusedName(name)); return; }
    commitUpdate({
      variables: { input: { id: row.id, data: toB64(data), creatorKey: yoursKey }, yoursKey },
      onCompleted: () => { say(done); setRenaming(null); },
      onError: err => say(problem(err, doing)),
    });
  }

  return (
    <li className="grid gap-1 border-t border-dashed border-foreground py-2">
      <div className="flex items-baseline gap-2">
        <span className="tracking-[.06em]">{row.name || "UNTITLED"}</span>
        {row.yours && <Badge title="SAVED FROM THIS DEVICE">YOURS</Badge>}
        <span className="lead" />
        <time dateTime={row.updatedAt} className={SMALL}>{date(row.updatedAt)}</time>
      </div>
      {renaming !== null ? (
        <form className="flex flex-wrap gap-1.5" onSubmit={e => { e.preventDefault(); if (bytes) update(V.setName(bytes, renaming), "RENAME", `RENAMED TO ${renaming.trim() || "UNTITLED"}.`); }}>
          <input
            aria-label={`NEW NAME FOR ${row.name}`} autoFocus maxLength={NAME_MAX} value={renaming}
            onChange={e => setRenaming(e.target.value.toUpperCase())}
            onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); setRenaming(null); } }}
            className="h-8 w-[16ch] border border-foreground bg-background px-2 uppercase outline-none focus-visible:outline-1 focus-visible:outline-offset-3 focus-visible:outline-dashed touch:text-[16px]"
          />
          <Button type="submit" disabled={busy}>{updating ? "SAVING…" : "SAVE NAME"}</Button>
          <Button type="button" onClick={() => setRenaming(null)}>CANCEL</Button>
        </form>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          <Button disabled={!bytes} onClick={() => bytes && onOpen(bytes)}>OPEN</Button>
          {onAddToBank && <Button disabled={!bytes} onClick={() => bytes && onAddToBank(bytes)}>ADD TO BANK</Button>}
          {row.yours && (
            <>
              <Button disabled={busy || !bytes} onClick={() => setRenaming(row.name)}>RENAME</Button>
              <Button
                disabled={busy} aria-pressed={confirm === "update"}
                onBlur={() => setConfirm(c => (c === "update" ? null : c))}
                onClick={() => {
                  if (confirm !== "update") { setConfirm("update"); return; }
                  setConfirm(null);
                  update(voice, "UPDATE", `UPDATED WITH THE VOICE YOU'RE EDITING.`);
                }}
              >{confirm === "update" ? "REPLACE WITH CURRENT?" : updating ? "SAVING…" : "UPDATE"}</Button>
              <Button
                disabled={busy} aria-pressed={confirm === "delete"}
                onBlur={() => setConfirm(c => (c === "delete" ? null : c))}
                onClick={() => {
                  if (confirm !== "delete") { setConfirm("delete"); return; }
                  setConfirm(null);
                  commitDelete({
                    variables: { input: { id: row.id, creatorKey: yoursKey }, connections: [connectionId] },
                    onCompleted: () => say(`DELETED ${row.name || "UNTITLED"} FROM THE SHARED LIST.`),
                    onError: err => say(problem(err, "DELETE")),
                  });
                }}
              >{confirm === "delete" ? "CONFIRM DELETE" : deleting ? "DELETING…" : "DELETE"}</Button>
            </>
          )}
        </div>
      )}
    </li>
  );
}

function RowItem({ node, ...actions }: RowActions & { node: Shared_row$key }) {
  // fragment data is read here so each row only re-renders on its own changes
  return <Row row={useFragment<Shared_row$key>(RowFragment, node)} {...actions} />;
}

interface Filters { creatorKey: string | null; search: string | null; yoursKey: string }

function List({ filters, fetchKey, onConnection, ...actions }: Omit<RowActions, "connectionId" | "yoursKey"> & { filters: Filters; fetchKey: string; onConnection: (id: string) => void }) {
  const query = useLazyLoadQuery<SharedQuery>(ListQuery, { count: PAGE, ...filters }, { fetchKey, fetchPolicy: "store-and-network" });
  const { data, loadNext, hasNext, isLoadingNext } = usePaginationFragment<SharedPaginationQuery, Shared_list$key>(ListFragment, query);
  const [nextFailed, setNextFailed] = useState(false);
  const connectionId = data.dmbkSoundVzVoices.__id;
  useEffect(() => { onConnection(connectionId); }, [connectionId, onConnection]);
  const edges = data.dmbkSoundVzVoices.edges;
  const more = () => { setNextFailed(false); loadNext(PAGE, { onComplete: err => { if (err) setNextFailed(true); } }); };
  return (
    <>
      {edges.length === 0 ? (
        <p className={NOTE}>{filters.search ? `NO SHARED VOICE NAMED ${filters.search}.` : filters.creatorKey ? "YOU HAVEN'T SHARED A VOICE FROM THIS DEVICE YET." : "NOTHING SHARED YET."}</p>
      ) : (
        <ul className="m-0 grid list-none p-0">
          {edges.map(e => <RowItem key={e.node.id} node={e.node} connectionId={connectionId} yoursKey={filters.yoursKey} {...actions} />)}
        </ul>
      )}
      {nextFailed && <p className={NOTE}>COULD NOT LOAD MORE.</p>}
      {hasNext && <Button className="w-full" onClick={more} disabled={isLoadingNext}>{isLoadingNext ? "LOADING…" : nextFailed ? "RETRY" : "MORE"}</Button>}
    </>
  );
}

class LoadFailed extends Component<{ children: ReactNode; onRetry: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="grid gap-2">
        <p className={NOTE}>COULD NOT LOAD THE SHARED LIST.</p>
        <Button onClick={this.props.onRetry}>RETRY</Button>
      </div>
    );
  }
}

function Save({ voice, yoursKey, connection, onKey, say }: { voice: Uint8Array; yoursKey: string; connection: () => { id: string | null; search: boolean }; onKey: (k: string) => void; say: (m: string) => void }) {
  const [commit, saving] = useMutation<SharedSaveMutation>(SaveMutation);
  const onSave = () => {
    const name = V.getName(voice);
    if (!isNameAllowed(name)) { say(refusedName(name)); return; }
    const key = yoursKey || D.ensureKey();
    if (key !== yoursKey) onKey(key);
    commit({
      variables: { input: { data: toB64(voice), creatorKey: key }, yoursKey: key },
      updater: (store: RecordSourceSelectorProxy<SharedSaveMutation$data>) => { const c = connection(); prependSaved(c.id, c.search)(store); },
      onCompleted: res => say(res.dmbkSoundSaveVzVoice.created ? `SHARED ${name || "UNTITLED"}.` : `${name || "UNTITLED"} IS ALREADY IN THE SHARED LIST.`),
      onError: err => say(problem(err, "SAVE")),
    });
  };
  return <Button onClick={onSave} disabled={saving}>{saving ? "SAVING…" : "SHARE CURRENT"}</Button>;
}

function DeviceKey({ yoursKey, onKey }: { yoursKey: string; onKey: (k: string) => void }) {
  const [shown, setShown] = useState(false);
  const [paste, setPaste] = useState("");
  const [msg, setMsg] = useState("");
  return (
    <details className="border-t border-foreground pt-2">
      <summary className={`${SMALL} cursor-pointer`}>DEVICE KEY</summary>
      <div className="mt-2 grid gap-2">
        <p className={NOTE}>
          This key is what makes a shared voice yours: with it you can rename, update and delete what you shared. It is
          kept only in this browser, and the server stores only a hash of it. Copy it to another browser to manage your
          voices there too. Anyone with it can change them, so keep it private. Clearing this site&apos;s data without a
          copy loses it, and your shared voices stay public.
        </p>
        {yoursKey ? (
          <div className={ROW + " mt-0"}>
            <code className="min-w-0 flex-1 truncate text-[11px]">{shown ? yoursKey : "•".repeat(20)}</code>
            <Button onClick={() => setShown(s => !s)}>{shown ? "HIDE" : "SHOW"}</Button>
            <Button onClick={() => navigator.clipboard.writeText(yoursKey).then(() => setMsg("KEY COPIED."), () => setMsg("COULD NOT COPY. SHOW IT AND COPY BY HAND."))}>COPY</Button>
          </div>
        ) : <p className={NOTE}>No key yet: one is made the first time you share a voice.</p>}
        <form className={ROW + " mt-0"} onSubmit={e => {
          e.preventDefault();
          if (!D.useKey(paste)) { setMsg("THAT ISN'T A DEVICE KEY (43 LETTERS, DIGITS, - AND _)."); return; }
          onKey(paste.trim()); setPaste(""); setMsg("THIS BROWSER NOW USES THAT KEY.");
        }}>
          <input
            aria-label="PASTE A DEVICE KEY" placeholder="PASTE A KEY FROM ANOTHER BROWSER" value={paste} onChange={e => setPaste(e.target.value)}
            className="h-8 min-w-0 flex-1 border border-foreground bg-background px-2 text-[11px] outline-none focus-visible:outline-1 focus-visible:outline-offset-3 focus-visible:outline-dashed touch:text-[16px]"
          />
          <Button type="submit" disabled={!paste.trim()}>USE KEY</Button>
        </form>
        {yoursKey && <p className={NOTE}>Using another key replaces this one here. Copy this one first if you still need it.</p>}
        {msg && <p role="status" className={NOTE}>{msg}</p>}
      </div>
    </details>
  );
}

interface Props {
  voice: Uint8Array;
  onOpen: (bytes: Uint8Array) => void;
  onAddToBank: ((bytes: Uint8Array) => void) | null;
}

export default function Shared({ voice, onOpen, onAddToBank }: Props) {
  const [yoursKey, setYoursKey] = useState("");
  const [mine, setMine] = useState(false);
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
  const [retries, setRetries] = useState(0);
  const [msg, setMsg] = useState("");
  const connectionId = useRef<string | null>(null);

  useEffect(() => { setYoursKey(D.readKey() ?? ""); }, []);
  // search as you type, after a pause
  useEffect(() => {
    const t = setTimeout(() => setSearch(text.trim()), 300);
    return () => clearTimeout(t);
  }, [text]);

  const filters: Filters = { creatorKey: mine && yoursKey ? yoursKey : null, search: search || null, yoursKey };
  const fetchKey = String(retries);
  const onConnection = (id: string) => { connectionId.current = id; };

  return (
    <RelayEnvironmentProvider environment={relayEnvironment()}>
      <div className={ROW + " mt-0"}>
        <Save voice={voice} yoursKey={yoursKey} connection={() => ({ id: connectionId.current, search: !!search })} onKey={setYoursKey} say={setMsg} />
      </div>
      {msg && <p role="status" className={NOTE}>{msg}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="SHOW" className="flex gap-1.5">
          <Button aria-pressed={!mine} onClick={() => setMine(false)}>ALL</Button>
          <Button aria-pressed={mine} disabled={!yoursKey} onClick={() => setMine(true)}>YOURS</Button>
        </div>
        <label className="flex min-w-[12rem] flex-1 items-center gap-2">
          <span id="shared-search-label" className={SMALL}>SEARCH</span>
          <input
            type="search" aria-labelledby="shared-search-label" maxLength={NAME_MAX} value={text} onChange={e => setText(e.target.value.toUpperCase())}
            className="h-8 min-w-0 flex-1 border border-foreground bg-background px-2 uppercase outline-none focus-visible:outline-1 focus-visible:outline-offset-3 focus-visible:outline-dashed touch:text-[16px]"
          />
        </label>
      </div>
      <LoadFailed key={fetchKey} onRetry={() => setRetries(n => n + 1)}>
        <Suspense fallback={<p className={NOTE}>LOADING…</p>}>
          <List filters={filters} fetchKey={fetchKey} onConnection={onConnection} voice={voice} onOpen={onOpen} onAddToBank={onAddToBank} say={setMsg} />
        </Suspense>
      </LoadFailed>
      <DeviceKey yoursKey={yoursKey} onKey={k => { setYoursKey(k); setMsg(""); }} />
    </RelayEnvironmentProvider>
  );
}
