#!/usr/bin/env node
try {
  await import('../dist/cli/main.js');
} catch (err) {
  if (err?.code === 'ERR_MODULE_NOT_FOUND' && String(err.message).includes('dist/cli/main.js')) {
    console.error('sweep: @sweep/core is not built. Run `pnpm build:core` first.');
    process.exit(2);
  }
  throw err;
}
