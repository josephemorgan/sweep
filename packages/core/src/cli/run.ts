import { validateFile } from './validate.js';

export interface CliIo {
  stdout: (line: string) => void;
  stderr: (line: string) => void;
  readFile: (path: string) => Uint8Array;
  /** Directory that relative file arguments resolve against. */
  cwd: string;
}

export const USAGE = 'Usage: sweep validate <file> [--json]';

/** Runs the `sweep` CLI and returns the exit code (spec §9: 0 no errors, 1 errors, 2 usage or unreadable file). */
export function run(argv: readonly string[], io: CliIo): number {
  if (argv.includes('--help') || argv.includes('-h')) {
    io.stdout(USAGE);
    return 0;
  }
  const [command, ...rest] = argv;
  if (command === 'validate') {
    const flags = rest.filter((a) => a.startsWith('-') && a !== '-');
    const files = rest.filter((a) => !a.startsWith('-') || a === '-');
    const [file] = files;
    if (file === undefined || files.length !== 1 || flags.some((f) => f !== '--json')) {
      io.stderr(USAGE);
      return 2;
    }
    return validateFile(file, flags.length > 0, io);
  }
  io.stderr(USAGE);
  return 2;
}
