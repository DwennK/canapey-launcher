import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { compareVersions, publishChannel } from '../scripts/publish-update-channel.mjs';

const directories = [];
afterEach(() => directories.splice(0).forEach(dir => rmSync(dir, { recursive: true, force: true })));
const key = Buffer.from(`untrusted comment: minisign public key\n${Buffer.concat([Buffer.from('Ed'), Buffer.alloc(40)]).toString('base64')}\n`).toString('base64');
function configure(version, publicKey = key) {
  const cwd = mkdtempSync(join(tmpdir(), 'canapey-updater-'));
  directories.push(cwd);
  mkdirSync(join(cwd, 'src-tauri'));
  writeFileSync(join(cwd, 'package.json'), JSON.stringify({ version }));
  const result = spawnSync(process.execPath, [resolve('scripts/configure-release.mjs')], {
    cwd, encoding: 'utf8', env: { ...process.env, GITHUB_REPOSITORY: 'DwennK/canapey-launcher', TAURI_UPDATER_PUBLIC_KEY: publicKey },
  });
  return { result, config: () => JSON.parse(readFileSync(join(cwd, 'src-tauri/tauri.release.conf.json'), 'utf8')) };
}

describe('signed release configuration', () => {
  it.each([
    ['0.2.1', 'https://raw.githubusercontent.com/DwennK/canapey-launcher/updates/0.x.json'],
    ['1.0.0', 'https://github.com/DwennK/canapey-launcher/releases/latest/download/latest.json'],
  ])('configures the correct channel for %s', (version, endpoint) => {
    const { result, config } = configure(version);
    expect(result.status, result.stderr).toBe(0);
    expect(config().plugins.updater.endpoints).toEqual([endpoint]);
    expect(config().plugins.updater.pubkey).toBe(key);
    expect(config().bundle.createUpdaterArtifacts).toBe(true);
  });
  it.each(['', '/tmp/public.key', Buffer.from('untrusted comment:\nRWfake').toString('base64')])('rejects missing or invalid keys', value => {
    expect(configure('0.2.1', value).result.status).not.toBe(0);
  });
});

function fixture(currentVersion) {
  const repository = 'DwennK/canapey-launcher', tag = 'v0.2.1';
  const prefix = `https://github.com/${repository}/releases/download/${tag}/`;
  const name = 'Canapey.Launcher_0.2.1_x64-setup.exe';
  const bytes = Buffer.from('test installer bytes');
  const manifest = { version: '0.2.1', platforms: { 'windows-x86_64': { url: prefix + name, signature: 'test-signature' } } };
  const release = {
    tag_name: tag, draft: false, prerelease: true, published_at: '2026-10-17T10:00:00Z', body: 'Reviewed notes',
    assets: ['latest.json', name, `${name}.sig`].map(name => ({ name, state: 'uploaded', browser_download_url: prefix + name,
      size: bytes.length, digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}` })),
  };
  const writes = [];
  const github = async (path, options = {}) => {
    if (options.method) { writes.push({ path, ...options }); return {}; }
    if (path.endsWith(`/releases/tags/${tag}`)) return release;
    if (path.endsWith('/git/ref/heads/updates')) return currentVersion ? { object: { sha: 'branch-sha' } } : null;
    if (path.endsWith('/contents/0.x.json?ref=updates')) return { sha: 'file-sha', content: Buffer.from(JSON.stringify({ version: currentVersion })).toString('base64') };
    if (path.endsWith('/git/ref/heads/main')) return { object: { sha: 'main-sha' } };
    if (path === `repos/${repository}`) return { default_branch: 'main' };
    throw new Error(`Unexpected request ${path}`);
  };
  const download = async url => {
    if (url.endsWith('/latest.json')) return Buffer.from(JSON.stringify(manifest));
    if (url.endsWith('.sig')) return Buffer.from('test-signature\r\n');
    if (url === prefix + name) return bytes;
    throw new Error(`Unexpected download ${url}`);
  };
  return { repository, tag, github, download, release, manifest, writes };
}

describe('0.x publication gate', () => {
  it('bootstraps the channel only after validating published assets', async () => {
    const f = fixture();
    await publishChannel(f);
    expect(f.writes[0].body).toEqual({ ref: 'refs/heads/updates', sha: 'main-sha' });
    const payload = JSON.parse(Buffer.from(f.writes[1].body.content, 'base64').toString());
    expect(payload).toEqual({ ...f.manifest, notes: 'Reviewed notes', pub_date: f.release.published_at });
  });
  it('uses the previous file SHA for an atomic channel advance', async () => {
    const f = fixture('0.2.0');
    await publishChannel(f);
    expect(f.writes).toHaveLength(1);
    expect(f.writes[0].body.sha).toBe('file-sha');
  });
  it.each(['0.2.1', '0.10.0'])('does not replace an equal or newer channel (%s)', async version => {
    const f = fixture(version);
    await publishChannel(f);
    expect(f.writes).toEqual([]);
  });
  it.each([
    ['draft', f => { f.release.draft = true; }],
    ['stable release', f => { f.release.prerelease = false; }],
    ['unpublished', f => { f.release.published_at = null; }],
    ['wrong version', f => { f.manifest.version = '0.3.0'; }],
    ['missing manifest', f => { f.release.assets.shift(); }],
    ['missing signature', f => { f.release.assets.pop(); }],
    ['different signature', f => { f.manifest.platforms['windows-x86_64'].signature = 'other'; }],
    ['foreign installer', f => { f.manifest.platforms['windows-x86_64'].url = 'https://example.com/setup.exe'; }],
    ['corrupt installer', f => { f.release.assets[1].digest = 'sha256:wrong'; }],
  ])('rejects %s without changing the channel', async (_, change) => {
    const f = fixture();
    change(f);
    await expect(publishChannel(f)).rejects.toThrow();
    expect(f.writes).toEqual([]);
  });
  it('keeps the channel unchanged on GitHub or download failures', async () => {
    const f = fixture('0.2.0');
    await expect(publishChannel({ ...f, download: async () => { throw new Error('timeout'); } })).rejects.toThrow('timeout');
    await expect(publishChannel({ ...f, github: async () => { throw new Error('forbidden'); } })).rejects.toThrow('forbidden');
    expect(f.writes).toEqual([]);
  });
  it('compares numeric versions and refuses other channels', () => {
    expect(compareVersions('0.10.0', '0.9.9')).toBe(1);
    expect(() => compareVersions('1.0.0', '0.9.9')).toThrow();
    expect(() => compareVersions('0.2.1-beta', '0.2.0')).toThrow();
  });
});
