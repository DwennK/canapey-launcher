import type { Target } from './types';

const brandLogos = new Map([
  ['netflix', '/brands/netflix.svg'],
  ['youtube', '/brands/youtube.svg'],
  ['spotify', '/brands/spotify.png'],
  ['steam', '/brands/steam.svg'],
  ['plezy', '/brands/plezy.svg'],
  ['silo', '/brands/silo.svg'],
]);
const aliases = new Map([['vacuumtube', 'youtube']]);
const packages = new Map([
  ['4df9e0f8.netflix', 'netflix'],
  ['spotifyab.spotifymusic', 'spotify'],
]);

function knownName(name: string): string | undefined {
  const normalized = name.trim().toLowerCase();
  return brandLogos.get(aliases.get(normalized) ?? normalized);
}

function targetLogo(target?: Target): string | undefined {
  if (!target) return;
  if (target.kind === 'executable' || target.kind === 'shortcut') {
    const filename = target.value.split(/[\\/]/).pop() ?? '';
    return knownName(filename.replace(/\.(exe|lnk)$/i, ''));
  }
  if (target.kind === 'packaged') {
    const brand = packages.get(target.value.toLowerCase().split('_')[0]!);
    return brand ? brandLogos.get(brand) : undefined;
  }
  try {
    const url = new URL(target.value);
    if (url.protocol === 'spotify:') return brandLogos.get('spotify');
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return;
    for (const [domain, brand] of [
      ['netflix.com', 'netflix'], ['youtube.com', 'youtube'],
      ['youtu.be', 'youtube'], ['spotify.com', 'spotify'],
    ]) {
      if (url.hostname === domain || url.hostname.endsWith(`.${domain}`))
        return brandLogos.get(brand!);
    }
  } catch { /* An unrecognized target keeps its native icon. */ }
}

// Resolve identity independently of the editable artwork theme. Bundled logos
// stay sharp offline and take priority over small Windows shell icons.
export function appLogoCandidates(name: string, target?: Target, icon?: string): string[] {
  const brand = targetLogo(target) ?? knownName(name);
  return [...new Set([brand, icon].filter((src): src is string => !!src))];
}
