// Core builds with `types: []`, so `TextDecoder` (a global in browsers and Node) needs this
// minimal ambient declaration. It declares only what the text layer uses.
declare class TextDecoder {
  constructor(label?: string, options?: { fatal?: boolean; ignoreBOM?: boolean });
  decode(input?: Uint8Array): string;
}
