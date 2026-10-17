// One vector master for the UI, browser tabs, Windows app and notification tray.
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const master = await readFile(path.join(root, 'public/brand/canapey-mark.svg'), 'utf8');
const shapes = master.replace(/<svg[^>]*>/, '').replace('</svg>', '').trim();
const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="16" fill="#191c22"/>
  <g transform="translate(4.8 4.8) scale(.85)" fill="#e9dece">${shapes}</g>
</svg>\n`;
await writeFile(path.join(root, 'public/brand/canapey-icon.svg'), icon);
const output = path.join(root, 'output/brand-icons');
await mkdir(output, { recursive: true });
function generate(args) {
  const result = spawnSync(process.execPath, [path.join(root, 'node_modules/@tauri-apps/cli/tauri.js'), 'icon', path.join(root, 'public/brand/canapey-icon.svg'), '-o', output, ...args], { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) throw new Error('Icon generation failed');
}
generate([]);
await copyFile(path.join(output, 'icon.png'), path.join(root, 'src-tauri/icons/icon.png'));
await copyFile(path.join(output, 'icon.ico'), path.join(root, 'src-tauri/icons/icon.ico'));
await copyFile(path.join(output, 'icon.ico'), path.join(root, 'public/favicon.ico'));
generate(['--png', '180']);
await copyFile(path.join(output, '180x180.png'), path.join(root, 'public/apple-touch-icon.png'));
console.log('Updated Canapey browser and desktop icons from canapey-mark.svg.');
