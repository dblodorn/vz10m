// VZ-1 / VZ-10M System Exclusive framing. Reading messages lives in @dblodorn/casio-vz-engine (re-exported here);
// building them is the editor's alone, since the package only plays voices.
//
//   F0 44 03 00 7n TT II  <payload: 2 nibbles per data byte, high first>  CS F7
//
//   n   basic channel 0-15
//   TT  message type: 00 voice, 01 operation
//   II  receive area: 40 = the normal / edit area
//   CS  7-bit checksum: (-(sum of decoded data bytes)) & 0x7F
//
// Confirmed against a real 681-byte voice dump (riban-bw/vzeditor library/KILLER ORGAN.vzt) and riban's
// working receive code. See openspec/specs/vz-sysex/spec.md for sources and what is still unverified.

import { AREA_EDIT, checksum, HEADER_SIZE, MANUFACTURER, messageLength, type MessageType } from "@dblodorn/casio-vz-engine";

export {
  AREA_EDIT, checksum, denibblize, HEADER_SIZE, isVz, MANUFACTURER, messageLength, OPERATION_BYTES, parse, SIZE_OF,
  splitMessages, TYPE, VOICE_BYTES, type MessageType, type Parsed,
} from "@dblodorn/casio-vz-engine";

export interface FrameOptions {
  channel?: number; // 1-16
  area?: number;
}

export function nibblize(data: Uint8Array): Uint8Array {
  const out = new Uint8Array(data.length * 2);
  data.forEach((b, i) => { out[i * 2] = (b >> 4) & 0x0f; out[i * 2 + 1] = b & 0x0f; });
  return out;
}

// data: decoded bytes (336 for a voice, 100 for an operation)
export function frame(type: MessageType, data: Uint8Array, { channel = 1, area = AREA_EDIT }: FrameOptions = {}): Uint8Array {
  const ch = Math.max(1, Math.min(16, channel | 0)) - 1;
  const msg = new Uint8Array(messageLength(data.length));
  msg.set([0xf0, MANUFACTURER, 0x03, 0x00, 0x70 | ch, type, area]);
  msg.set(nibblize(data), HEADER_SIZE);
  msg[msg.length - 2] = checksum(data);
  msg[msg.length - 1] = 0xf7;
  return msg;
}
