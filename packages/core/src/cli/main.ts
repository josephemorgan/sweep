import { readFileSync } from 'node:fs';
import { run } from './run.js';

process.exitCode = run(process.argv.slice(2), {
  stdout: (line) => process.stdout.write(`${line}\n`),
  stderr: (line) => process.stderr.write(`${line}\n`),
  readFile: (p) => readFileSync(p),
  cwd: process.env.INIT_CWD ?? process.cwd(),
});
