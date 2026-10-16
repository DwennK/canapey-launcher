import fs from 'node:fs';

const publicKey = process.env.TAURI_UPDATER_PUBLIC_KEY?.trim();
const repository = process.env.GITHUB_REPOSITORY?.trim();
const { version } = JSON.parse(fs.readFileSync('package.json', 'utf8'));
if (!publicKey || !repository || !/^[-\w.]+\/[-\w.]+$/.test(repository)) {
  throw new Error('Configure TAURI_UPDATER_PUBLIC_KEY and GITHUB_REPOSITORY (owner/repository).');
}
const decoded = Buffer.from(publicKey, 'base64').toString();
const lines = decoded.trim().split(/\r?\n/);
if (!lines[0]?.startsWith('untrusted comment:') || Buffer.from(lines[1] ?? '', 'base64').length !== 42) {
  throw new Error('TAURI_UPDATER_PUBLIC_KEY must contain the complete base64 Tauri public key, not a path.');
}
if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
  throw new Error('Expected a numeric major.minor.patch version.');
}
const endpoint = version.startsWith('0.')
  ? `https://raw.githubusercontent.com/${repository}/updates/0.x.json`
  : `https://github.com/${repository}/releases/latest/download/latest.json`;
const config = {
  bundle: { createUpdaterArtifacts: true },
  plugins: {
    updater: { pubkey: publicKey, endpoints: [endpoint], windows: { installMode: 'passive' } },
  },
};
fs.writeFileSync('src-tauri/tauri.release.conf.json', JSON.stringify(config, null, 2) + '\n');
console.log(`Signed release configuration ready for ${repository} (${version.startsWith('0.') ? '0.x' : 'stable'} channel).`);
