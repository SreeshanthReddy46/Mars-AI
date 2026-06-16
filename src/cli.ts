#!/usr/bin/env node
import { startInteractiveShell } from './shell/index.js';
import path from 'path';

async function main() {
  const targetPath = process.argv[2] || '.';
  const projectRoot = path.resolve(targetPath);
  
  await startInteractiveShell(projectRoot);
}

main().catch((err) => {
  console.error('[Fatal Error] Failed to boot MARS shell:', err);
  process.exit(1);
});
