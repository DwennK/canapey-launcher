import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

function versionParts(version) {
  if (!/^0\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) throw new Error('Expected a 0.x version.');
  return version.split('.').map(BigInt);
}

export function compareVersions(left, right) {
  const a = versionParts(left), b = versionParts(right);
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
  }
  return 0;
}

export async function publishChannel({ repository, tag, github, download }) {
  if (!/^[-\w.]+\/[-\w.]+$/.test(repository ?? '')) throw new Error('Invalid repository.');
  versionParts((tag ?? '').replace(/^v/, ''));
  if (!tag.startsWith('v')) throw new Error('Expected a version tag.');
  const base = `repos/${repository}`;
  const release = await github(`${base}/releases/tags/${tag}`);
  if (release.draft || !release.prerelease || !release.published_at || release.tag_name !== tag) {
    throw new Error('Only a published 0.x prerelease can advance this channel.');
  }
  const prefix = `https://github.com/${repository}/releases/download/${tag}/`;
  function asset(name) {
    const matches = release.assets.filter(a => a.name === name && a.state === 'uploaded');
    if (matches.length !== 1 || matches[0].browser_download_url !== prefix + encodeURIComponent(name)) {
      throw new Error(`Missing or invalid release asset: ${name}`);
    }
    return matches[0];
  }
  const manifest = JSON.parse((await download(asset('latest.json').browser_download_url)).toString());
  if (manifest.version !== tag.slice(1)) throw new Error('Manifest version does not match release tag.');
  const platform = manifest.platforms?.['windows-x86_64'];
  if (!platform || !platform.url?.startsWith(prefix) || !platform.signature?.trim()) {
    throw new Error('Missing signed Windows x64 update.');
  }
  const name = decodeURIComponent(platform.url.slice(prefix.length));
  if (!name.endsWith('.exe') || name.includes('/')) throw new Error('Expected an NSIS installer.');
  const installer = asset(name);
  if (installer.browser_download_url !== platform.url) throw new Error('Installer URL mismatch.');
  const signature = (await download(asset(`${name}.sig`).browser_download_url)).toString().trim();
  if (signature !== platform.signature.trim()) throw new Error('Signature does not match manifest.');
  const bytes = await download(installer.browser_download_url);
  const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  if (installer.digest !== digest || installer.size !== bytes.length) throw new Error('Installer integrity check failed.');

  // Publish only the tested platform, with the final human-reviewed release notes.
  const content = JSON.stringify({
    version: manifest.version, notes: release.body ?? '', pub_date: release.published_at,
    platforms: { 'windows-x86_64': platform },
  }, null, 2) + '\n';
  const branch = await github(`${base}/git/ref/heads/updates`, { optional: true });
  let previous;
  if (branch) {
    previous = await github(`${base}/contents/0.x.json?ref=updates`, { optional: true });
    if (previous) {
      const current = JSON.parse(Buffer.from(previous.content, 'base64').toString());
      if (compareVersions(manifest.version, current.version) <= 0) return 'Channel already at this version or newer.';
    }
  } else {
    const repo = await github(base);
    const head = await github(`${base}/git/ref/heads/${repo.default_branch}`);
    await github(`${base}/git/refs`, { method: 'POST', body: { ref: 'refs/heads/updates', sha: head.object.sha } });
  }
  await github(`${base}/contents/0.x.json`, { method: 'PUT', body: {
    message: `build: promote ${tag} to the experimental update channel`,
    branch: 'updates', content: Buffer.from(content).toString('base64'),
    ...(previous ? { sha: previous.sha } : {}),
  } });
  return `Published ${tag} to the 0.x update channel.`;
}

function github(path, { method = 'GET', body, optional = false } = {}) {
  try {
    const args = ['api', path, '--method', method];
    if (body) args.push('--input', '-');
    return JSON.parse(execFileSync('gh', args, {
      input: body ? JSON.stringify(body) : undefined, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    }));
  } catch (error) {
    // Never treat authentication/network failures as a missing branch or manifest.
    if (optional && /\(HTTP 404\)/.test(error.stderr?.toString() ?? '')) return null;
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(await publishChannel({
    repository: process.env.GITHUB_REPOSITORY, tag: process.env.RELEASE_TAG, github,
    download: async url => {
      const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error(`Asset download failed (${response.status}).`);
      return Buffer.from(await response.arrayBuffer());
    },
  }));
}
