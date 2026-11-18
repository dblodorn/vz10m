import { test } from "node:test";
import assert from "node:assert/strict";
import { isNameAllowed, joinSpelledOut } from "../lib/vz/names.ts";
import { ensureKey, isDeviceKey } from "../lib/device.ts";

test("names: obscene ones refused, look-alikes and spelled-out too; innocent ones kept", () => {
  for (const name of ["F U C K PAD", "5H1T BASS", "SHIT"]) assert.equal(isNameAllowed(name), false, name);
  for (const name of ["SCUNTHORPE", "CLASSIC", "A B C PAD", "KILLER ORGAN", ""]) assert.equal(isNameAllowed(name), true, name);
});

test("joinSpelledOut joins runs of single letters only", () => {
  assert.equal(joinSpelledOut("F U C K PAD"), "FUCK PAD");
  assert.equal(joinSpelledOut("AB CD"), "AB CD");
});

test("a new device key is 43 base64url characters, different each time", () => {
  // localStorage isn't there in Node, so ensureKey makes a new key on each call
  const a = ensureKey(), b = ensureKey();
  assert.ok(isDeviceKey(a) && isDeviceKey(b));
  assert.notEqual(a, b);
  assert.equal(isDeviceKey("too-short"), false);
  assert.equal(isDeviceKey("a".repeat(42) + "="), false);
});
