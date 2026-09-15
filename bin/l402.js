#!/usr/bin/env node

// Executable entrypoint for l402 CLI
const path = require('node:path');
const fs = require('node:fs');

// Check if compiled dist/cli.js exists, otherwise use tsx
const distCli = path.join(__dirname, '..', 'dist', 'cli.js');

if (fs.existsSync(distCli)) {
  require(distCli);
} else {
  // Execute via tsx directly in development
  const { spawn } = require('node:child_process');
  const tsxCli = path.join(__dirname, '..', 'src', 'cli.ts');
  const child = spawn('npx', ['tsx', tsxCli, ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: process.env
  });
  child.on('exit', (code) => {
    process.exit(code || 0);
  });
}
