import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const script = resolve('scripts/version.mjs');
const files = ['package.json', 'package-lock.json', 'src-tauri/tauri.conf.json', 'src-tauri/Cargo.toml', 'src-tauri/Cargo.lock'];
const directories: string[] = [];
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'canapey-version-'));
  directories.push(directory);
  mkdirSync(join(directory, 'src-tauri'));
  for (const file of files) writeFileSync(join(directory, file), readFileSync(file));
  return directory;
}
afterEach(() => directories.splice(0).forEach(directory => rmSync(directory, { recursive: true, force: true })));

describe('release version consistency', () => {
  it.each(['patch', 'minor'])('keeps all manifests and lockfiles aligned after a %s bump', mode => {
    const cwd = fixture();
    const [major, minor, patch] = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8')).version.split('.').map(Number);
    const expected = mode === 'patch' ? `${major}.${minor}.${patch + 1}` : `${major}.${minor + 1}.0`;
    execFileSync(process.execPath, [script, mode], { cwd });
    expect(execFileSync(process.execPath, [script, 'check', `--tag=v${expected}`], { cwd, encoding: 'utf8' })).toContain(expected);
  });

  it('rejects inconsistent input before changing any files', () => {
    const cwd = fixture();
    writeFileSync(join(cwd, 'src-tauri/tauri.conf.json'), '{"version":"0.999.0"}\n');
    const before = files.map(file => readFileSync(join(cwd, file), 'utf8'));
    expect(spawnSync(process.execPath, [script, 'patch'], { cwd }).status).not.toBe(0);
    expect(files.map(file => readFileSync(join(cwd, file), 'utf8'))).toEqual(before);
  });

  it('rejects a mismatched release tag and an automatic major bump', () => {
    const cwd = fixture();
    expect(spawnSync(process.execPath, [script, 'check', '--tag=v9.9.9'], { cwd }).status).not.toBe(0);
    expect(spawnSync(process.execPath, [script, 'major'], { cwd }).status).not.toBe(0);
  });
});
