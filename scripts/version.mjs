import fs from 'node:fs';

const mode = process.argv[2] ?? 'check';
if (!['check', 'patch', 'minor'].includes(mode)) {
  throw new Error('Usage: node scripts/version.mjs check|patch|minor [--tag=vX.Y.Z]');
}

const paths = ['package.json', 'package-lock.json', 'src-tauri/tauri.conf.json', 'src-tauri/Cargo.toml', 'src-tauri/Cargo.lock'];
const contents = paths.map(path => fs.readFileSync(path, 'utf8'));
const [pkg, lock, tauri] = contents.slice(0, 3).map(text => JSON.parse(text));
const cargoPattern = /(^\[package\][\s\S]*?^version\s*=\s*")([^"]+)(")/m;
const lockPattern = /(^\[\[package\]\]\r?\nname = "canapey-launcher"\r?\nversion = ")([^"]+)(")/m;
const versions = [pkg.version, lock.version, lock.packages[''].version, tauri.version, contents[3].match(cargoPattern)?.[2], contents[4].match(lockPattern)?.[2]];
const current = versions[0];
if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(current) || versions.some(version => version !== current)) {
  throw new Error(`Inconsistent project versions: ${JSON.stringify(versions)}`);
}
const tag = process.argv.slice(3).find(arg => arg.startsWith('--tag='))?.slice(6);
if (tag && tag !== `v${current}`) throw new Error(`Tag ${tag} does not match v${current}`);
if (mode === 'check') {
  console.log(`All project versions match ${current}.`);
} else {
  const [major, minor, patch] = current.split('.').map(Number);
  if (major !== 0) throw new Error('This release policy is for experimental 0.x versions. Review the policy before a stable release.');
  const next = mode === 'minor' ? `0.${minor + 1}.0` : `0.${minor}.${patch + 1}`;
  pkg.version = lock.version = lock.packages[''].version = tauri.version = next;
  const updated = [
    ...[pkg, lock, tauri].map(value => JSON.stringify(value, null, 2) + '\n'),
    contents[3].replace(cargoPattern, (_, before, _version, after) => before + next + after),
    contents[4].replace(lockPattern, (_, before, _version, after) => before + next + after),
  ];
  // Validate every input before changing any file; never commit or tag implicitly.
  paths.forEach((path, index) => fs.writeFileSync(path, updated[index]));
  console.log(`Version updated: ${current} -> ${next}. Update CHANGELOG.md before publishing.`);
}
