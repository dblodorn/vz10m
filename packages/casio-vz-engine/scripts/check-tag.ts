#!/usr/bin/env node
// CI guard before publishing: the pushed tag must be `<package name without scope>@<package.json version>`.
//   node scripts/check-tag.ts casio-vz-engine@0.1.0
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pkg = JSON.parse(readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "../package.json"), "utf8")) as { name: string; version: string };
const expected = `${pkg.name.replace(/^@[^/]+\//, "")}@${pkg.version}`;
const tag = process.argv[2] ?? "";
if (tag !== expected) {
  console.error(`Tag "${tag}" doesn't match the package: expected "${expected}". Bump package.json or fix the tag.`);
  process.exit(1);
}
console.log(`tag ${tag} matches ${pkg.name}@${pkg.version}`);
