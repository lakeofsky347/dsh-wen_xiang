import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync, readFileSync, copyFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { resolveSemver, versionSatisfies, assertRuntimeCompatibility, resolveRuntimeCache } from '../scripts/environment.mjs';

const semver = resolveSemver();
const range = '>=0.2.0-rc.2 <0.3.0-0';
test('DSH 范围与宿主一致地纳入预发布，并拒绝未支持的后续 minor', () => {
  for (const version of ['0.2.0-rc.2', '0.2.0', '0.2.1-alpha.5', '0.2.1-rc.1', '0.2.1', '0.2.9']) assert.equal(versionSatisfies(version, range, semver), true, version);
  for (const version of ['0.2.0-rc.1', '0.3.0-alpha.1', '0.3.0-0', '0.3.0', '1.0.0', 'invalid']) assert.equal(versionSatisfies(version, range, semver), false, version);
  assert.equal(versionSatisfies('4.0.5', '^4.0.4', semver), true);
  assert.equal(versionSatisfies('4.0.5', '', semver), false);
  assert.equal(versionSatisfies('4.0.5', 'workspace:*', semver), false);
});
test('发布校验检查实际包名、peer 范围与 engines.dsh，不靠精确版本字符串', () => {
  const manifest = { engines: { dsh: range }, peerDependencies: { '@deepseek-ai/dsh-llm': range, '@deepseek-ai/cordis': '^4.0.4' } };
  const peers = { '@deepseek-ai/dsh-llm': { name: '@deepseek-ai/dsh-llm', version: '0.2.1-rc.1' }, '@deepseek-ai/cordis': { name: '@deepseek-ai/cordis', version: '4.0.5' } };
  assert.doesNotThrow(() => assertRuntimeCompatibility(manifest, '0.2.1-rc.1', peers, semver));
  assert.throws(() => assertRuntimeCompatibility(manifest, '0.3.0-alpha.1', peers, semver), /outside engines.dsh/);
  assert.throws(() => assertRuntimeCompatibility(manifest, '0.2.1-rc.1', { ...peers, '@deepseek-ai/dsh-llm': { name: 'wrong-package', version: '0.2.1-rc.1' } }, semver), /does not provide/);
  assert.throws(() => assertRuntimeCompatibility(manifest, '0.2.1-rc.1', {}, semver), /does not provide/);
});
test('缓存按发布指纹隔离；自定义路径及状态文件不能逃出 checkout', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'wenxiang-compat-cache-'));
  try {
    const descriptor = { version: '0.2.1-rc.1', fingerprint: 'a'.repeat(64), platform: process.platform, arch: process.arch };
    const first = resolveRuntimeCache(root, descriptor, {});
    const changed = resolveRuntimeCache(root, { ...descriptor, fingerprint: 'b'.repeat(64) }, {});
    assert.notEqual(first.directory, changed.directory);
    assert.equal(resolveRuntimeCache(root, descriptor, { DSH_RUNTIME_CACHE: '.local/review-runtime' }).directory, path.join(root, '.local/review-runtime'));
    assert.throws(() => resolveRuntimeCache(root, descriptor, { DSH_RUNTIME_CACHE: '../daily' }), /DSH_RUNTIME_CACHE/);
    mkdirSync(path.join(root, '.local'), { recursive: true });
    mkdirSync(path.join(root, 'daily'));
    symlinkSync(path.join(root, 'daily'), path.join(root, '.local/escape'), process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(() => resolveRuntimeCache(root, descriptor, { DSH_RUNTIME_CACHE: '.local/escape/cache' }), /DSH_RUNTIME_CACHE/);
    symlinkSync(path.join(root, 'daily', 'selection.json'), first.selected);
    assert.throws(() => resolveRuntimeCache(root, descriptor, {}), /symlink outside/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test('显式 ASAR 缓存有无关文件时停止提取并保留原目录', () => {
  const fixture = mkdtempSync(path.join(tmpdir(), 'wenxiang-cache-adoption-'));
  const root = path.join(fixture, 'plugin'), resources = path.join(fixture, 'resources');
  try {
    mkdirSync(path.join(root, 'scripts'), { recursive: true });
    mkdirSync(path.join(root, 'node_modules'), { recursive: true });
    mkdirSync(path.join(root, '.local/fixed-runtime'), { recursive: true });
    mkdirSync(resources);
    const manifest = { name: 'fixture-plugin', type: 'module', engines: { dsh: range }, devDependencies: {}, peerDependencies: {} };
    writeFileSync(path.join(root, 'package.json'), JSON.stringify(manifest));
    symlinkSync(path.dirname(createRequire(import.meta.url).resolve('semver/package.json')), path.join(root, 'node_modules/semver'), process.platform === 'win32' ? 'junction' : 'dir');
    for (const name of ['prepare-local.mjs', 'environment.mjs']) copyFileSync(new URL(`../scripts/${name}`, import.meta.url), path.join(root, 'scripts', name));
    const runtimeManifest = Buffer.from(JSON.stringify({ name: 'fixture-runtime', version: '0.2.1-rc.1' }));
    const header = Buffer.from(JSON.stringify({ files: { dsh: { files: { 'package.json': { offset: '0', size: runtimeManifest.length } } } } }));
    const prefix = Buffer.alloc(16); prefix.writeUInt32LE(8 + header.length, 4); prefix.writeUInt32LE(header.length, 12);
    writeFileSync(path.join(resources, 'app.asar'), Buffer.concat([prefix, header, runtimeManifest]));
    const unrelated = path.join(root, '.local/fixed-runtime/unrelated.txt');
    writeFileSync(unrelated, 'keep this existing directory');
    const execute = () => spawnSync(process.execPath, [path.join(root, 'scripts/prepare-local.mjs')], { cwd: root, encoding: 'utf8', env: { ...process.env, DSH_REFERENCE: '', DSH_RUNTIME: '', DSH_RESOURCES: resources, DSH_RUNTIME_CACHE: '.local/fixed-runtime' } });
    const rejected = execute(); assert.notEqual(rejected.status, 0); assert.match(rejected.stderr, /cached .local\/runtime differs/);
    assert.equal(readFileSync(unrelated, 'utf8'), 'keep this existing directory');
    assert.equal(existsSync(path.join(root, '.local/fixed-runtime/package.json')), false);
    assert.equal(existsSync(path.join(root, '.local/runtime-selected.json')), false);
    rmSync(unrelated);
    const prepared = execute(); assert.equal(prepared.status, 0, prepared.stderr);
    assert.equal(readFileSync(path.join(root, '.local/fixed-runtime/package.json'), 'utf8'), runtimeManifest.toString());
  } finally { rmSync(fixture, { recursive: true, force: true }); }
});
