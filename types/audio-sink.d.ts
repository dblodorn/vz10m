// AudioContext output-device selection (Chrome and Edge 110+), not yet in TypeScript's DOM lib.
// https://webaudio.github.io/web-audio-api/#dom-audiocontext-setsinkid
interface AudioContext {
  readonly sinkId: string;
  setSinkId(sinkId: string): Promise<void>;
}
