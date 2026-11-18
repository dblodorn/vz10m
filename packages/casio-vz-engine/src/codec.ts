// Voices and operations are kept as their decoded bytes (Uint8Array(336) / Uint8Array(100)): the bytes are the
// source of truth. Reads go through the field tables in params.ts. This package only reads; changing a voice
// (set, setName, initVoice, building SysEx) is the editor's (apps/editor/lib/vz/codec.ts).

import { parse, splitMessages, TYPE, VOICE_BYTES, OPERATION_BYTES, type MessageType } from "./sysex.ts";
import { VOICE_FIELD, VOICE_FIELDS, VOICE_NAME, OPERATION_FIELD, OPERATION_FIELDS, OPERATION_NAME, type Field, type NameSlot } from "./params.ts";

export type Kind = "voice" | "operation";

interface Table { field: Record<string, Field>; fields: Field[]; name: NameSlot }
const tables: Record<MessageType, Table> = {
  [TYPE.VOICE]: { field: VOICE_FIELD, fields: VOICE_FIELDS, name: VOICE_NAME },
  [TYPE.OPERATION]: { field: OPERATION_FIELD, fields: OPERATION_FIELDS, name: OPERATION_NAME },
};

// The message type that data of this length is: a voice (336 bytes) or an operation (100). Throws otherwise.
export function typeOf(data: Uint8Array): MessageType {
  if (data.length === VOICE_BYTES) return TYPE.VOICE;
  if (data.length === OPERATION_BYTES) return TYPE.OPERATION;
  throw new Error(`Expected ${VOICE_BYTES} (voice) or ${OPERATION_BYTES} (operation) bytes, got ${data.length}.`);
}
const tableFor = (data: Uint8Array): Table => tables[typeOf(data)];

// Where a field lives in this data (a voice's or an operation's table). Throws on an unknown key.
export function fieldOf(data: Uint8Array, key: string): Field {
  const f = tableFor(data).field[key];
  if (!f) throw new Error(`Unknown parameter ${key}.`);
  return f;
}

// Where the 12-character name lives in this data.
export const nameSlotOf = (data: Uint8Array): NameSlot => tableFor(data).name;

export function get(data: Uint8Array, key: string): number {
  const f = fieldOf(data, key);
  return (data[f.byte]! & f.mask) >> f.shift;
}

// VZ names are 12 ASCII characters, space padded
export function getName(data: Uint8Array): string {
  const { offset, length } = nameSlotOf(data);
  return String.fromCharCode(...data.subarray(offset, offset + length)).replace(/[^\x20-\x7e]/g, " ").trimEnd();
}

// every field as a flat { key: value } object, plus the name: for display, search and storage
export function toParams(data: Uint8Array): { name: string; values: Record<string, number> } {
  const values: Record<string, number> = {};
  for (const f of tableFor(data).fields) values[f.key] = (data[f.byte]! & f.mask) >> f.shift;
  return { name: getName(data), values };
}

export interface SyxItem { kind: Kind; data: Uint8Array; name: string }
export interface SyxError { index: number; message: string }

// Every voice and operation found in a .syx file (or any byte stream), in order. Messages that fail to parse
// are reported, not thrown, so one damaged dump doesn't hide the rest of a file.
export function fromSyx(bytes: Uint8Array): { items: SyxItem[]; errors: SyxError[] } {
  const items: SyxItem[] = [], errors: SyxError[] = [];
  splitMessages(bytes).forEach((msg, i) => {
    try {
      const { type, data } = parse(msg);
      items.push({ kind: type === TYPE.VOICE ? "voice" : "operation", data, name: getName(data) });
    } catch (e) {
      errors.push({ index: i, message: e instanceof Error ? e.message : String(e) });
    }
  });
  return { items, errors };
}

// A voice from its 336 decoded bytes or from one VZ voice SysEx message, as a fresh copy. Throws with a reason
// a person can read for anything else (an operation, a damaged dump, the wrong length).
export function readVoice(bytes: Uint8Array): Uint8Array {
  if (!(bytes instanceof Uint8Array)) throw new Error("A voice must be a Uint8Array.");
  if (bytes[0] === 0xf0) {
    const { type, data } = parse(bytes);
    if (type !== TYPE.VOICE) throw new Error("That message is an operation, not a voice.");
    return data;
  }
  if (bytes.length !== VOICE_BYTES) throw new Error(`Expected ${VOICE_BYTES} voice bytes or a voice SysEx message, got ${bytes.length} bytes.`);
  return bytes.slice();
}
