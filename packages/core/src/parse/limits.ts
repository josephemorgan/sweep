/** Guide limits (spec §3.7). */
export const LIMITS = {
  fileBytes: 2 * 1024 * 1024,
  sections: 2_000,
  tasks: 10_000,
  categories: 50,
  nestingDepth: 5,
  windowsPerTask: 8,
  requiresIds: 50,
  renamedFromEntries: 20,
  walkthroughChars: 100_000,
  howChars: 10_000,
  yamlAliasExpansions: 100,
} as const;
