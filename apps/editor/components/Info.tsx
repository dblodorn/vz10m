"use client";

// A small (?) button that opens a popover explaining one part of the editor in terms of the VZ-10M's
// architecture: the package's Info with an entry from lib/help.ts.

import { Info as SoundInfo } from "@dblodorn/sound-ui";
import { HELP, type Help, type HelpKey } from "../lib/help";

export default function Info({ k }: { k: HelpKey }) {
  const h: Help = HELP[k];
  return <SoundInfo title={h.title} body={h.body} editor={h.editor} source={h.manual && `VZ-10M owner's manual ${h.manual}`} />;
}
