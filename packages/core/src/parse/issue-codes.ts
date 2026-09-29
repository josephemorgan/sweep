/** Error codes (spec §3.6). Any error rejects an upload. */
export const ErrorCode = {
  Encoding: 'encoding',
  TooLarge: 'too-large',
  NoRootFile: 'no-root-file',
  YamlSyntax: 'yaml-syntax',
  MdFrontMatter: 'md-front-matter',
  FormatVersion: 'format-version',
  Required: 'required',
  Type: 'type',
  IdFormat: 'id-format',
  IdDuplicate: 'id-duplicate',
  IdReserved: 'id-reserved',
  NoLeaves: 'no-leaves',
  UnknownSection: 'unknown-section',
  UnknownCategory: 'unknown-category',
  RequiresEmptyAny: 'requires-empty-any',
  RequiresLineage: 'requires-lineage',
  RequiresCycle: 'requires-cycle',
  HomeNotLeaf: 'home-not-leaf',
  HomeOutsideWindow: 'home-outside-window',
  UntilBeforeFrom: 'until-before-from',
  WindowOrder: 'window-order',
  EndNotLast: 'end-not-last',
  ExclusiveSingle: 'exclusive-single',
  RenameConflict: 'rename-conflict',
  MdHeading: 'md-heading',
  MdUnknownSection: 'md-unknown-section',
  MdDuplicateSection: 'md-duplicate-section',
  WalkthroughTwice: 'walkthrough-twice',
  Limit: 'limit',
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** Warning codes (spec §3.6). Shown in the report, never blocking. */
export const WarningCode = {
  UnknownKey: 'unknown-key',
  UnusedCategory: 'unused-category',
  OverviewLong: 'overview-long',
  MdHtml: 'md-html',
  MdImage: 'md-image',
  MdPreamble: 'md-preamble',
} as const;
export type WarningCode = (typeof WarningCode)[keyof typeof WarningCode];

/** Scaffold-only code returned by the parseGuide stub. Session A deletes it. */
export const NOT_IMPLEMENTED = 'not-implemented' as const;

export type IssueCode = ErrorCode | WarningCode | typeof NOT_IMPLEMENTED;
