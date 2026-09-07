#!/usr/bin/env node
/** Syntax-check every application source file; never pass an empty source set. */
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const sourceRoot = join(root, 'src');

function discoverJavaScriptFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...discoverJavaScriptFiles(path));
    else if (entry.isFile() && entry.name.endsWith('.js')) files.push(path);
  }
  return files;
}

const srcFiles = discoverJavaScriptFiles(sourceRoot);
if (srcFiles.length === 0) {
  throw new Error('No JavaScript source files discovered under src/. Refusing to pass an empty check.');
}

const rootFiles = readdirSync(root, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
  .map((entry) => join(root, entry.name));
const files = [...rootFiles, ...srcFiles]
  .map((path) => relative(root, path).split(sep).join('/'))
  .sort();
const failIndex = Number(process.env.VEYRA_CHECK_FAIL_INDEX);
const failures = [];

for (const [index, file] of files.entries()) {
  const command = Number.isInteger(failIndex) && failIndex === index
    ? ['-e', 'console.error("intentional checker negative control"); process.exit(1);']
    : ['--check', file];
  const child = spawnSync(process.execPath, command, { cwd: root, stdio: 'inherit' });
  if (child.status !== 0) failures.push(file);
  console.log(`${child.status === 0 ? 'PASS' : 'FAIL'} ${file}`);
}

console.log(`${files.length - failures.length} of ${files.length} source files passed syntax check`);
if (failures.length) process.exitCode = 1;
