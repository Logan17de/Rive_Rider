#!/usr/bin/env node
/** Always-run test battery. Every suite runs even after a failure. */
import { closeSync, mkdtempSync, openSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const suites = Object.freeze([
  'tests/architecture-modules.test.mjs',
  'tests/veyra-model.test.mjs',
  'tests/veyra-foundation.test.mjs',
  'tests/veyra-rigging.test.mjs',
  'tests/veyra-animation.test.mjs',
  'tests/veyra-statemachine.test.mjs',
  'tests/veyra-manifest.test.mjs',
  'tests/veyra-store.test.mjs',
  'tests/veyra-listeners.test.mjs',
  'tests/veyra-golden.test.mjs',
  'tests/veyra-machine-invariants.test.mjs',
  'tests/veyra-browser.test.mjs',
  'tests/veyra-renderer-interaction.test.mjs',
  'tests/veyra-override-merge.test.mjs',
  'tests/veyra-gestures.test.mjs',
  'tests/veyra-hittest.test.mjs',
  'tests/veyra-listener-runtime-invariants.test.mjs',
  'tests/veyra-listeners-runtime.test.mjs',
]);

const testFiles = readdirSync(join(root, 'tests'))
  .filter((name) => name.endsWith('.test.mjs'))
  .map((name) => `tests/${name}`)
  .sort();
const listed = [...suites].sort();
if (testFiles.length !== listed.length || testFiles.some((file, i) => file !== listed[i])) {
  const missing = testFiles.filter((file) => !suites.includes(file));
  const stale = suites.filter((file) => !testFiles.includes(file));
  throw new Error(`Suite list is out of sync. Unlisted: ${missing.join(', ') || 'none'}; missing files: ${stale.join(', ') || 'none'}.`);
}

const results = [];
const outputDir = mkdtempSync(join(tmpdir(), 'veyra-suite-'));
try {
for (const [index, suite] of suites.entries()) {
  const outputPath = join(outputDir, `${results.length}.log`);
  const outputFd = openSync(outputPath, 'w');
  // Verification-only fault injection lets the no-short-circuit property be
  // demonstrated without editing a wired suite or leaving a broken file.
  const failIndex = Number(process.env.VEYRA_RUNNER_FAIL_INDEX);
  const command = Number.isInteger(failIndex) && failIndex === index
    ? ['-e', 'console.error("intentional runner negative control"); process.exit(1);']
    : [suite];
  const child = spawnSync(process.execPath, command, { cwd: root, stdio: ['ignore', outputFd, outputFd] });
  closeSync(outputFd);
  const output = `${readFileSync(outputPath, 'utf8')}${child.error ? `\n${child.error.message}` : ''}`;
  const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const passLine = lines.filter((line) => /(?:passed|checks green|All .*green|contract items enforced)/i.test(line)).at(-1) || '';
  const ok = child.status === 0;
  results.push({ suite, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${suite}${ok && passLine ? ` — ${passLine}` : ''}`);
  if (!ok && output) console.log(output.trimEnd());
}

const passed = results.filter((result) => result.ok).length;
console.log(`${passed} of ${suites.length} suites passed`);
if (passed !== suites.length) process.exitCode = 1;
} finally {
  rmSync(outputDir, { recursive: true, force: true });
}
