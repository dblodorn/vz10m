#!/usr/bin/env node
// tsc's rewriteRelativeImportExtensions turns `./x.ts` into `./x.js` in the emitted JavaScript but not in the
// declarations. Consumers without allowImportingTsExtensions would reject `.ts` paths there, so rewrite them.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), "../dist");
for (const file of readdirSync(dist, { recursive: true, encoding: "utf8" })) {
  if (!file.endsWith(".d.ts")) continue;
  const p = path.join(dist, file);
  const text = readFileSync(p, "utf8");
  const fixed = text.replace(/(from\s+|import\()(["'])(\.{1,2}\/[^"']+)\.ts\2/g, "$1$2$3.js$2");
  if (fixed !== text) writeFileSync(p, fixed);
}
