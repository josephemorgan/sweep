/** Spec §6.4 upload limits, checked in the browser first (the server checks again). */
export const MAX_GUIDE_BYTES = 2 * 1024 * 1024;

export function guideFileProblem(file: File): string | null {
  if (!/\.(ya?ml|md)$/i.test(file.name)) return 'Choose a .yaml, .yml or .md file.';
  if (file.size > MAX_GUIDE_BYTES) return 'Guide files must be 2 MiB or smaller.';
  return null;
}
