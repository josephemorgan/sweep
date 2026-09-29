#!/usr/bin/env node
import { existsSync } from 'node:fs';
const main = new URL('../dist/cli/main.js', import.meta.url);
if (!existsSync(main)) {
  console.error('sweep: @sweep/core is not built. Run `pnpm build:core` first.');
  process.exit(2);
}
await import(main.href);
