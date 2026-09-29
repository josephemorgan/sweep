/** The `sweep:` value a v1 guide file declares (spec §3.3). */
export const FORMAT_VERSION = 1 as const;

/**
 * Version of the normalized `Guide` model (spec §4.1). The server re-normalizes stored
 * guide sources when this changes (spec §6.1). Bump it whenever `Guide`'s shape changes.
 */
export const MODEL_VERSION: number = 1;
