// Reuse released DSH artifacts and installed development tools without changing them.
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync, symlinkSync, lstatSync, readlinkSync, unlinkSync, realpathSync, readdirSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { resolveProjectRoot, resolveReference, resolveRuntimeSource, linkDirectory, resolveSemver, versionSatisfies, assertRuntimeCompatibility, resolveRuntimeCache, assertPreviewPath } from './environment.mjs';

const root = resolveProjectRoot(import.meta.url);
const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const source = resolveRuntimeSource({ root });
const semver = resolveSemver({ root, runtime: source.kind === 'directory' ? source.root : undefined });
const hash = value => createHash('sha256').update(value).digest('hex');
const stale = () => new Error('The cached .local/runtime differs from the selected DSH release. Select a new DSH_RUNTIME_CACHE directory inside .local, then run prepare:local again. Earlier caches and the installed DSH runtime will not be overwritten.');
const present = value => { try { return lstatSync(value); } catch (error) { if (error.code === 'ENOENT') return undefined; throw error; } };
const compatible = (expected, actual) => versionSatisfies(actual, expected, semver);

// Resolve all tools before writing the cache. Normal local npm installs also work.
const loaders = [createRequire(resolve(root, 'package.json'))];
if (process.env.DSH_REFERENCE?.trim() || existsSync(resolve(root, '../dsh_clone/package.json'))) {
  const reference = resolveReference({ root });
  loaders.push(createRequire(resolve(reference, 'package.json')));
  const uiManifest = resolve(reference, 'packages/client/ui-plugin-manager/package.json');
  if (existsSync(uiManifest)) loaders.push(createRequire(uiManifest));
}
const tools = Object.entries(manifest.devDependencies).map(([name, expected]) => {
  for (const loader of loaders) {
    let entry; try { entry = loader.resolve(`${name}/package.json`); } catch { continue; }
    const installed = JSON.parse(readFileSync(entry, 'utf8'));
    if (installed.name === name && compatible(expected, installed.version)) return [name, dirname(entry)];
  }
  throw new Error(`Development tool ${name}@${expected} was not found. Install the declared development dependencies or set DSH_REFERENCE to a prepared checkout.`);
});

let entries = [], bytesFor, runtimeManifest, releaseMetadata, fingerprint;
if (source.kind === 'asar') {
  const archive = readFileSync(source.archive), headerSize = archive.readUInt32LE(4);
  const header = JSON.parse(archive.subarray(16, 16 + archive.readUInt32LE(12)).toString()), dataStart = 8 + headerSize;
  if (!header.files?.dsh?.files) throw new Error('The selected app.asar has no complete dsh runtime. Use DSH_RUNTIME for a released directory layout.');
  const walk = (tree, prefix = 'dsh') => {
    for (const [name, item] of Object.entries(tree.files)) {
      if (!name || name === '.' || name === '..' || /[\\/]/.test(name)) throw new Error('The release archive contains an unsafe path.');
      const archivePath = `${prefix}/${name}`;
      if (item.files) walk(item, archivePath); else entries.push({ archivePath, item });
    }
  };
  walk(header.files.dsh);
  bytesFor = ({ archivePath, item }) => item.unpacked ? readFileSync(resolve(source.resources, 'app.asar.unpacked', archivePath)) : archive.subarray(dataStart + Number(item.offset), dataStart + Number(item.offset) + item.size);
  const json = name => { const entry = entries.find(item => item.archivePath === `dsh/${name}`); return entry ? JSON.parse(bytesFor(entry).toString('utf8')) : undefined; };
  runtimeManifest = json('package.json'); releaseMetadata = json('desktop-runtime.json');
  fingerprint = hash(archive);
} else {
  runtimeManifest = JSON.parse(readFileSync(resolve(source.root, 'package.json'), 'utf8'));
  const releaseFile = resolve(source.root, 'desktop-runtime.json');
  releaseMetadata = existsSync(releaseFile) ? JSON.parse(readFileSync(releaseFile, 'utf8')) : undefined;
  fingerprint = hash(JSON.stringify({ source: realpathSync(source.root), manifest: runtimeManifest, release: releaseMetadata }));
}
if (!runtimeManifest?.version) throw new Error('The selected runtime has no release version.');
if (releaseMetadata?.platform && releaseMetadata.platform !== process.platform || releaseMetadata?.arch && releaseMetadata.arch !== process.arch) throw new Error(`The selected runtime is for ${releaseMetadata.platform}/${releaseMetadata.arch}; this Node process is ${process.platform}/${process.arch}. Select a runtime from this machine.`);
const descriptor = { schemaVersion: 1, kind: source.kind, fingerprint, name: runtimeManifest.name, version: runtimeManifest.version, platform: process.platform, arch: process.arch };
const cache = resolveRuntimeCache(root, descriptor), local = cache.directory, markerPath = cache.marker;
for (const entry of entries) entry.output = resolve(local, entry.archivePath.slice(4));
if (existsSync(markerPath)) {
  const previous = JSON.parse(readFileSync(markerPath, 'utf8'));
  if (previous.fingerprint !== fingerprint || previous.kind !== source.kind || previous.platform !== process.platform || previous.arch !== process.arch) throw stale();
}

// Check the declared host faces before extracting or linking any release files.
const peers = {};
for (const name of Object.keys(manifest.peerDependencies)) {
  let peer;
  if (source.kind === 'directory') {
    const file = resolve(source.root, 'node_modules', name, 'package.json');
    if (existsSync(file)) peer = JSON.parse(readFileSync(file, 'utf8'));
  } else {
    const entry = entries.find(item => item.archivePath === `dsh/node_modules/${name}/package.json`);
    if (entry) peer = JSON.parse(bytesFor(entry).toString('utf8'));
  }
  peers[name] = peer;
}
assertRuntimeCompatibility(manifest, runtimeManifest.version, peers, semver);

let extracted = 0;
if (source.kind === 'directory') {
  if (present(local)) {
    if (realpathSync(local) !== realpathSync(source.root)) throw stale();
  } else { mkdirSync(dirname(local), { recursive: true }); linkDirectory(source.root, local); }
} else {
  if (present(local)?.isSymbolicLink()) throw stale();
  const expectedFiles = new Set(entries.map(entry => entry.output)), expectedDirectories = new Set();
  for (const filename of expectedFiles) {
    for (let directory = dirname(filename); directory !== local; directory = dirname(directory)) expectedDirectories.add(directory);
  }
  const inspectCache = directory => {
    for (const item of readdirSync(directory, { withFileTypes: true })) {
      const filename = resolve(directory, item.name);
      if (item.isDirectory()) {
        if (!expectedDirectories.has(filename)) throw stale();
        inspectCache(filename);
      } else if (!expectedFiles.has(filename)) throw stale();
    }
  };
  if (present(local)) inspectCache(local);
  const linkTarget = entry => {
    const target = resolve(local, entry.item.link.replace(/^dsh\//, ''));
    if (target !== local && !target.startsWith(local + sep)) throw new Error('The release archive contains a link outside its runtime.');
    return target;
  };
  // A cache from the old script has no fingerprint. Compare every existing byte
  // before adopting it, so same-version builds cannot silently be mixed.
  for (const entry of entries) {
    assertPreviewPath(local, entry.output);
    const info = present(entry.output); if (!info) continue;
    if (entry.item.link) {
      if (!info.isSymbolicLink() || resolve(dirname(entry.output), readlinkSync(entry.output)) !== linkTarget(entry)) throw stale();
    } else if (!info.isFile() || !readFileSync(entry.output).equals(bytesFor(entry))) throw stale();
  }
  for (const entry of entries) {
    if (present(entry.output)) continue;
    mkdirSync(dirname(entry.output), { recursive: true });
    if (entry.item.link) linkDirectory(linkTarget(entry), entry.output);
    else if (entry.item.unpacked) copyFileSync(resolve(source.resources, 'app.asar.unpacked', entry.archivePath), entry.output);
    else writeFileSync(entry.output, bytesFor(entry), { mode: entry.item.executable ? 0o755 : 0o644 });
    extracted++;
  }
}
mkdirSync(dirname(markerPath), { recursive: true });
writeFileSync(markerPath, JSON.stringify(descriptor, null, 2) + '\n');

function link(name, target) {
  const destination = resolve(root, 'node_modules', name), info = present(destination);
  mkdirSync(dirname(destination), { recursive: true });
  if (info?.isSymbolicLink()) {
    if (existsSync(destination) && realpathSync(destination) === realpathSync(target)) return;
    unlinkSync(destination);
  } else if (info) {
    const file = resolve(destination, 'package.json'), installed = existsSync(file) && JSON.parse(readFileSync(file, 'utf8'));
    if (installed?.name === name && compatible(manifest.devDependencies[name] ?? manifest.peerDependencies[name], installed.version)) {
      if (!Object.hasOwn(manifest.peerDependencies, name)) return;
      throw new Error(`Existing node_modules/${name} is a separate host installation. Move that directory aside so this plugin uses the selected DSH runtime's service identities.`);
    }
    throw new Error(`Existing node_modules/${name} is not a matching dependency. Move that directory aside before preparing tools.`);
  }
  linkDirectory(target, destination);
}
for (const [name, target] of tools) link(name, target);
for (const name of Object.keys(manifest.peerDependencies)) link(name, resolve(local, 'node_modules', name));
mkdirSync(resolve(root, 'node_modules/.bin'), { recursive: true });
for (const [name, entry] of [['tsc', 'typescript/bin/tsc'], ['tsx', 'tsx/dist/cli.mjs']]) {
  const out = resolve(root, 'node_modules/.bin', process.platform === 'win32' ? `${name}.cmd` : name);
  if (!present(out)) {
    if (process.platform === 'win32') writeFileSync(out, `@echo off\r\nnode "%~dp0..\\${entry.replaceAll('/', '\\')}" %*\r\n`);
    else symlinkSync(resolve(root, 'node_modules', entry), out);
  }
}
writeFileSync(cache.selected, JSON.stringify({ ...descriptor, runtime: local, source: source.kind === 'asar' ? source.archive : source.root, peers: Object.fromEntries(Object.entries(peers).map(([name, value]) => [name, value.version])) }, null, 2) + '\n');
console.log(`Local tools ready for DSH ${runtimeManifest.version}; ${source.kind === 'asar' ? `extracted ${extracted} release files` : 'linked the released runtime read-only'}. Runtime: ${local}. Runtime fingerprint checked; earlier caches, installed DSH and reference tools remain unchanged.`);
