#!/usr/bin/env node
// Unpack capture-NN.json files (written by mcp__sweep-chrome__evaluate_script with
// scripts/capture-faq.js or the text-FAQ snippet in capture.md) into a source directory:
//
//   <dir>/pages/NN-<slug>.html   raw #faqwrap (HTML FAQs)
//   <dir>/pages/NN-<slug>.md     Markdown rendered from the DOM (HTML FAQs)
//   <dir>/full.md                every page in TOC order, each under `<!-- page: <slug> -->`
//   <dir>/full.txt               the whole guide (text FAQs)
//   <dir>/manifest.json          faq.json merged with the page list and any failures
//
// Usage: node scripts/unpack-capture.mjs <dir>
// <dir> must hold faq.json ({ id, title, author, url, listing, type: "html" | "text", … })
// and one or more capture-NN.json files. Re-running is safe: pages are rewritten in place.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
if (!dir) {
  console.error('usage: node scripts/unpack-capture.mjs <source dir>');
  process.exit(2);
}

const faq = JSON.parse(readFileSync(join(dir, 'faq.json'), 'utf8'));
const captures = readdirSync(dir)
  .filter((f) => /^capture-\d+\.json$/.test(f))
  .sort();
if (!captures.length) {
  console.error(`no capture-NN.json in ${dir}`);
  process.exit(2);
}

const pages = [];
const failed = [];
let capturedAt = null;
for (const file of captures) {
  const data = JSON.parse(readFileSync(join(dir, file), 'utf8'));
  capturedAt = capturedAt ?? data.capturedAt;
  for (const p of data.pages) {
    if (p.error || p.challenge || (p.html == null && p.text == null)) {
      failed.push({
        slug: p.slug,
        url: p.url,
        status: p.status,
        challenge: !!p.challenge,
        error: p.error,
      });
      continue;
    }
    pages.push(p);
  }
}

const manifest = { ...faq, capturedAt, pages: [], failed };
const n = (i) => String(i + 1).padStart(2, '0');

if (faq.type === 'text') {
  const text = pages.map((p) => p.text).join('\n');
  writeFileSync(join(dir, 'full.txt'), text);
  manifest.pages.push({ slug: 'full', file: 'full.txt', bytes: text.length });
} else {
  mkdirSync(join(dir, 'pages'), { recursive: true });
  const full = [];
  pages.forEach((p, i) => {
    const stem = `${n(i)}-${p.slug}`;
    writeFileSync(join(dir, 'pages', `${stem}.html`), p.html);
    writeFileSync(join(dir, 'pages', `${stem}.md`), p.md + '\n');
    full.push(`<!-- page: ${p.slug} -->\n\n${p.md}\n`);
    manifest.pages.push({
      slug: p.slug,
      title: p.title,
      url: p.url,
      status: p.status,
      html: `pages/${stem}.html`,
      md: `pages/${stem}.md`,
      mdBytes: p.md.length,
    });
  });
  writeFileSync(join(dir, 'full.md'), full.join('\n'));
}

writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`${manifest.pages.length} page(s) written to ${dir}; ${failed.length} failed`);
for (const f of failed)
  console.log(
    `  failed: ${f.slug} (${f.challenge ? 'challenge' : (f.error ?? `status ${f.status}`)})`,
  );
process.exit(failed.length ? 1 : 0);
