/** Maps an upload's name to its virtual root file name (spec §3.2), or null if unsupported. */
export function guideFileName(uploadName: string): 'guide.yaml' | 'guide.yml' | 'guide.md' | null {
  const base = uploadName.slice(uploadName.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  if (dot < 0) return null;
  switch (base.slice(dot + 1).toLowerCase()) {
    case 'yaml':
      return 'guide.yaml';
    case 'yml':
      return 'guide.yml';
    case 'md':
      return 'guide.md';
    default:
      return null;
  }
}
