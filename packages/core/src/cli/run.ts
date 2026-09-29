export interface CliIo {
  stdout: (line: string) => void;
  stderr: (line: string) => void;
}

export const USAGE = 'Usage: sweep validate <file> [--json]';

/**
 * Runs the `sweep` CLI and returns the exit code (spec §9: 0 no errors, 1 errors, 2 usage).
 * Scaffold stub: `validate` is wired for argument checking only.
 */
export function run(argv: readonly string[], io: CliIo): number {
  const [command, ...rest] = argv;
  if (command === '--help' || command === '-h') {
    io.stdout(USAGE);
    return 0;
  }
  if (command === 'validate') {
    const flags = rest.filter((a) => a.startsWith('-'));
    const files = rest.filter((a) => !a.startsWith('-'));
    if (files.length !== 1 || flags.some((f) => f !== '--json')) {
      io.stderr(USAGE);
      return 2;
    }
    io.stderr('sweep validate: not implemented yet (arrives with @sweep/core in session A).');
    return 1;
  }
  io.stderr(USAGE);
  return 2;
}
