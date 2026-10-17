// Run the same release gates against the runtime selected by prepare:local.
import { spawn } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), options = {};
for (let i = 0; i < args.length; i += 2) {
  if (!['--runtime', '--output'].includes(args[i]) || !args[i + 1]) throw new Error('Use [--runtime <released runtime directory>] [--output <report directory>]');
  options[args[i].slice(2)] = args[i + 1];
}
const out = resolve(root, options.output ?? `artifacts/verification-compatibility/${new Date().toISOString().replaceAll(':', '-')}`);
await mkdir(out, { recursive: true });
const env = { ...process.env, ...(options.runtime ? { DSH_RUNTIME: resolve(options.runtime) } : {}) };
const report = { checkedAt: new Date().toISOString(), node: process.version, platform: process.platform, arch: process.arch,
  evidence: 'Released runtime dependency identities, real storage/session integration tests, local synthetic provider tests, typecheck and build; browser and real provider acceptance are separate',
  status: 'RUNNING', checks: [] };

async function run(name, argv) {
  console.log(`[compat] ${name}`);
  let output = '';
  const result = await new Promise(resolveResult => {
    const child = spawn(process.execPath, argv, { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
    const collect = chunk => { output += chunk; };
    child.stdout.on('data', collect); child.stderr.on('data', collect);
    child.once('error', error => resolveResult({ code: 1, error: error.message }));
    child.once('close', code => resolveResult({ code: code ?? 1 }));
  });
  const log = resolve(out, `${name}.log`);
  await writeFile(log, output);
  report.checks.push({ name, status: result.code === 0 ? 'PASS' : 'FAIL', exitCode: result.code, log, ...(result.error ? { error: result.error } : {}) });
  if (result.code !== 0) throw new Error(`${name} failed; see ${log}`);
}

try {
  await run('prepare', ['scripts/prepare-local.mjs']);
  report.runtime = JSON.parse(await readFile(resolve(root, '.local/runtime-selected.json'), 'utf8'));
  env.DSH_TEST_RUNTIME = report.runtime.runtime;
  await run('typecheck', ['node_modules/typescript/bin/tsc', '--noEmit']);
  const tests = (await readdir(resolve(root, 'tests'))).filter(file => /\.test\.(?:ts|tsx|mjs)$/.test(file)).sort().map(file => `tests/${file}`);
  await run('tests', ['--import', 'tsx', '--test', ...tests]);
  await run('build', ['scripts/build.mjs']);
  await run('environment', ['scripts/verify-environment.mjs', '--runtime', report.runtime.runtime, '--output', resolve(out, 'environment.json')]);
  report.plugin = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  report.bundles = await Promise.all(['lib/index.js', 'lib/client.js'].map(async file => {
    const bytes = await readFile(resolve(root, file));
    return { file, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length };
  }));
  report.status = 'PASS';
} catch (error) {
  report.status = 'FAIL'; report.error = error.message;
  process.exitCode = 1;
} finally {
  const file = resolve(out, 'report.json');
  await writeFile(file, JSON.stringify(report, null, 2) + '\n');
  console.log(`[compat] ${report.status}: ${file}`);
}
