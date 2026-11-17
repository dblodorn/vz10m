// VZ-1 / VZ-10M System Exclusive framing. Pure functions, no browser globals.
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

export const MANUFACTURER = 0x44; // Casio
export const HEADER_SIZE = 7;
export const TYPE = { VOICE: 0x00, OPERATION: 0x01 };
export const AREA_EDIT = 0x40;
export const VOICE_BYTES = 336;
export const OPERATION_BYTES = 100;
export const SIZE_OF = { [TYPE.VOICE]: VOICE_BYTES, [TYPE.OPERATION]: OPERATION_BYTES };
// whole message length: header + nibbles + checksum + F7
export const messageLength = bytes => HEADER_SIZE + bytes * 2 + 2;

export function checksum(data) {
  let sum = 0;
  for (const b of data) sum += b;
  return -sum & 0x7f;
}

export function nibblize(data) {
  const out = new Uint8Array(data.length * 2);
  data.forEach((b, i) => { out[i * 2] = (b >> 4) & 0x0f; out[i * 2 + 1] = b & 0x0f; });
  return out;
}

export function denibblize(nibbles) {
  const out = new Uint8Array(nibbles.length >> 1);
  for (let i = 0; i < out.length; i++) out[i] = ((nibbles[i * 2] & 0x0f) << 4) | (nibbles[i * 2 + 1] & 0x0f);
  return out;
}

// data: decoded bytes (336 for a voice, 100 for an operation); channel 1-16
export function frame(type, data, { channel = 1, area = AREA_EDIT } = {}) {
  const ch = Math.max(1, Math.min(16, channel | 0)) - 1;
  const msg = new Uint8Array(messageLength(data.length));
  msg.set([0xf0, MANUFACTURER, 0x03, 0x00, 0x70 | ch, type, area]);
  msg.set(nibblize(data), HEADER_SIZE);
  msg[msg.length - 2] = checksum(data);
  msg[msg.length - 1] = 0xf7;
  return msg;
}

export const isVz = msg =>
  msg.length >= 8 && msg[0] === 0xf0 && msg[1] === MANUFACTURER && msg[2] === 0x03 && msg[3] === 0x00 &&
  (msg[4] & 0xf0) === 0x70 && msg[msg.length - 1] === 0xf7;

// Returns { type, channel, area, data } or throws with a reason a person can read.
export function parse(msg) {
  if (!isVz(msg)) throw new Error("Not a VZ-1/VZ-10M SysEx message.");
  const type = msg[5];
  const size = SIZE_OF[type];
  if (size === undefined) throw new Error(`Unsupported VZ message type 0x${type.toString(16).padStart(2, "0")}.`);
  if (msg.length !== messageLength(size)) throw new Error(`Expected ${messageLength(size)} bytes for this message, got ${msg.length}.`);
  const nibbles = msg.subarray(HEADER_SIZE, msg.length - 2);
  if (nibbles.some(n => n > 0x0f)) throw new Error("Payload is not nibble-encoded.");
  const data = denibblize(nibbles);
  const cs = msg[msg.length - 2];
  if (checksum(data) !== cs) throw new Error("Checksum mismatch: the dump is damaged.");
  return { type, channel: (msg[4] & 0x0f) + 1, area: msg[6], data };
}

// Split a byte stream (a .syx file, or several received messages) into F0..F7 messages.
export function splitMessages(bytes) {
  const out = [];
  let start = -1;
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 0xf0) start = i;
    else if (bytes[i] === 0xf7 && start >= 0) { out.push(bytes.slice(start, i + 1)); start = -1; }
  }
  return out;
}
