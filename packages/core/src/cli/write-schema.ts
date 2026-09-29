// Writes the generated guide JSON Schema to the path in argv[2] (`pnpm schema`).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { guideJsonSchema } from '../parse/json-schema.js';

const target = process.argv[2];
if (!target) {
  console.error('usage: write-schema <output-file>');
  process.exit(2);
}
const file = resolve(target);
mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, JSON.stringify(guideJsonSchema(), null, 2) + '\n');
