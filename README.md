# VZ-10M

A browser editor and librarian for the Casio VZ-10M, over Web MIDI SysEx.

```
pnpm install
pnpm dev
pnpm test
```

Use Chrome or Edge. On the VZ-10M set MENU 3-04 EXCLUSIVE=ENA and MENU 3-03 RECEIVE CH to the editor's CHANNEL. In the editor press MIDI → CONNECT MIDI and choose the ports. Selecting a sound on the VZ (NORMAL or COMBI play) sends it to the editor. Voices sent back land in the VZ's compare/recall area; press WRITE on the VZ to keep one.
