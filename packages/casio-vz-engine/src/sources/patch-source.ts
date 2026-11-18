// A library of voices the synth can load from. The dmbk library (dmbk.ts) is one; a host can bring its own by
// implementing this shape over whatever it stores voices in.

export interface PatchSummary {
  id: string;
  name: string;
}

export interface PatchQuery {
  search?: string; // names containing this text
  after?: string; // the `next` of the previous page
  first?: number; // page size
}

export interface PatchPage {
  items: PatchSummary[];
  next: string | null; // pass as `after` for the following page; null on the last page
}

export interface PatchSource {
  list(query?: PatchQuery): Promise<PatchPage>;
  // The voice's 336 decoded bytes, ready for loadVoice().
  get(id: string): Promise<Uint8Array>;
}
