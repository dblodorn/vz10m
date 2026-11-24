# @dblodorn/casio-vz-engine

The Casio VZ-1 / VZ-10M emulator as a sound source. Load a voice, play notes. It runs in an AudioWorklet inside your own `AudioContext`, or offline in Node.

The package only plays voices. It can read a voice (its name and field values), but it has no way to change one, build SysEx or send MIDI. For editing, use the [VZ-10M editor](https://github.com/dblodorn/vz10m), which this package comes from.

It is an approximate stand-in for the VZ, written from the owner's manual with several curves estimated, made for hearing voices while editing and for learning, not a replacement for the instrument.

The sound comes from an emulation, and its curves are estimates that haven't been checked against the hardware yet. A release that changes how a voice sounds says so in the changelog.

## Install

The package is on GitHub Packages, which needs a token to install, even for public packages. Make a classic personal access token with the `read:packages` scope, then add an `.npmrc` beside your `package.json`:

```
@dblodorn:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

```sh
GITHUB_TOKEN=ghp_… pnpm add @dblodorn/casio-vz-engine
```

It ships as ES modules with TypeScript types. Nothing needs to be built or configured on your side.

## Play

Browsers only start audio after a user gesture, so create or resume the context in a click. The context belongs to you: the package never creates, resumes, suspends or closes it.

```ts
import { createSynth } from "@dblodorn/casio-vz-engine";

let ctx: AudioContext | undefined;
let synth: Awaited<ReturnType<typeof createSynth>> | undefined;

button.onclick = async () => {
  ctx ??= new AudioContext();
  await ctx.resume();
  synth ??= await createSynth(ctx);
  synth.output.connect(ctx.destination); // or into your own mixer, effects, recorder…
  synth.loadVoice(voiceBytes);           // 336 bytes, or one VZ voice SysEx message
  synth.noteOn(60, 100);
  setTimeout(() => synth!.noteOff(60), 500);
};
```

`Synth`:

| | |
|---|---|
| `output` | An `AudioNode`, stereo (the mono engine on both channels). |
| `loadVoice(voice)` | Takes 336 decoded bytes or one voice SysEx message. Notes already sounding keep their voice. Anything else throws, and the old voice stays loaded. |
| `noteOn(note, velocity = 100)` | `note` is 0–127 and `velocity` is 0–127. Velocity 0 counts as a note-off. Values out of range throw a `RangeError`. |
| `noteOff(note)`, `allNotesOff()` | |
| `dispose()` | All notes off, disconnect, done. |

Up to 16 notes play at once. A 17th note takes the voice of the oldest one. Several synths can share one context, each with its own voice.

### Content-Security-Policy

By default the worklet is loaded from a `blob:` URL built from code inside the package, so there's nothing to copy into `public/`. If your CSP doesn't allow `blob:` scripts, serve the package's worklet file yourself and pass its URL:

```ts
// the file is @dblodorn/casio-vz-engine/worklet.js (node_modules/@dblodorn/casio-vz-engine/dist/worklet.js)
const synth = await createSynth(ctx, { workletUrl: "/casio-vz-worklet.js" });
```

### Offline, and in Node

```ts
import { createOfflineSynth } from "@dblodorn/casio-vz-engine";

const synth = createOfflineSynth(48000);
synth.loadVoice(voiceBytes);
synth.noteOn(60);
const out = new Float32Array(48000); // 1 s, mono
synth.render(out);
```

It has the same rules as `createSynth`, uses the same engine and gives the same samples. Use it for tests, rendering to files, or anywhere you want samples directly. With an `OfflineAudioContext`, use this instead of `createSynth`: messages to a worklet aren't delivered in step with an offline render.

## Voices

```ts
import { fromSyx, readVoice, getName, get } from "@dblodorn/casio-vz-engine";

const { items, errors } = fromSyx(new Uint8Array(await file.arrayBuffer()));
// items: [{ kind: "voice" | "operation", name, data }], errors: [{ index, message }]
const voices = items.filter(i => i.kind === "voice");

readVoice(bytes);              // 336 bytes or one voice message → a checked copy; throws otherwise
getName(voice);                // "KILLER ORGAN"
get(voice, "m1.env1.rate");    // a field's stored value; VOICE_FIELDS lists them all
```

`fromSyx` keeps going after a damaged message: it returns the messages it could read and reports each one it couldn't by its position. Operation messages are reported as operations, and `loadVoice` won't take them.

## Patch libraries

Everything that lists and fetches voices has the same shape, so the synth doesn't care where its voices come from:

```ts
interface PatchSource {
  list(query?: { search?: string; after?: string; first?: number }): Promise<{ items: { id: string; name: string }[]; next: string | null }>;
  get(id: string): Promise<Uint8Array>; // 336 bytes, ready for loadVoice
}
```

### Bring your own

Implement `PatchSource` over whatever you keep voices in: files, a database, your own API. No key is needed.

### The dmbk library

This is the public list of VZ voices shared from the editor. **It needs an API key, which is issued on request.** Ask the maintainer for one. The package contains no key and no default endpoint.

The key belongs on a server. Don't put it in browser code, where anyone can copy it. You have two ways to use it:

**From a server** (Node, a route handler, a build script):

```ts
import { dmbkLibrary } from "@dblodorn/casio-vz-engine";

const library = dmbkLibrary({ endpoint: "https://graphql.dmbk.network/graphql", apiKey: process.env.DMBK_GRAPHQL_API_KEY });
const page = await library.list({ search: "organ" }); // newest first, 20 at a time; search ≤ 12 characters
const voice = await library.get(page.items[0].id);
```

**From a browser, through your own route**, which adds the key on the server. In Next.js:

```ts
// app/api/vz-voices/route.ts
import { createDmbkProxyHandler } from "@dblodorn/casio-vz-engine";

export const POST = createDmbkProxyHandler({ apiKey: process.env.DMBK_GRAPHQL_API_KEY! });
```

```ts
// in the browser
const library = dmbkLibrary({ endpoint: "/api/vz-voices" });
synth.loadVoice(await library.get((await library.list()).items[0].id));
```

The handler is a standard `Request → Response` function, so it also works in Hono, Deno, Bun or workers.
- It accepts only same-origin POSTs of the library's two operations (list and get), with their variables checked.
- It forwards only the matching fixed query.
- It never forwards query text, so the key can't be used for anything else through it.

Errors from the API are thrown as `DmbkError`, with the API's `code` (for example `RATE_LIMITED` or `NOT_FOUND`).

## Versions

Versions follow semver:
- removing or changing an export is a major version;
- a change to how a voice sounds (a calibration) is at least a minor version, and the changelog says what changed.

See `CHANGELOG.md`.

## License

MIT, see `LICENSE`. It covers the package's code. Access to the dmbk library is separate and needs a key.
