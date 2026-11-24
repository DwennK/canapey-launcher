import { t } from './i18n';
import type english from '../locales/en.json';
import type { Target } from './types';

interface KnownApp { description: keyof typeof english; logo?: string }

const knownApps = new Map<string, KnownApp>([
  ['netflix', { description: 'Watch movies and series on Netflix.', logo: '/brands/netflix.svg' }],
  ['youtube', { description: 'YouTube on your TV, built for a controller.', logo: '/brands/youtube.svg' }],
  ['spotify', { description: 'Listen to music and podcasts on Spotify.', logo: '/brands/spotify.png' }],
  ['steam', { description: 'Play games from your Steam library.', logo: '/brands/steam.svg' }],
  ['plezy', { description: 'Stream your Plex or Jellyfin library with Plezy.', logo: '/brands/plezy.svg' }],
  ['silo', { description: 'Watch movies and series from your Silo server.', logo: '/brands/silo.svg' }],
  ['internet', { description: 'Browse the web on your TV.' }],
  ['launchbox', { description: 'Browse and launch your game collection with LaunchBox.' }],
  ['big box', { description: 'Play your LaunchBox collection in full screen.' }],
  ['plex', { description: 'Watch movies and shows from your Plex library.' }],
  ['vlc', { description: 'Play video and audio files with VLC.' }],
  ['xbox', { description: 'Browse and play your Xbox games on PC.' }],
  ['epic games launcher', { description: 'Play games from your Epic Games library.' }],
  ['gog galaxy', { description: 'Browse and launch your games with GOG GALAXY.' }],
  ['battle.net', { description: 'Launch your games from Battle.net.' }],
  ['disney+', { description: 'Stream movies and series on Disney+.' }],
  ['prime video', { description: 'Watch movies and series on Prime Video.' }],
  ['deezer', { description: 'Listen to albums and playlists on Deezer.' }],
  ['tidal', { description: 'Explore albums and music videos on TIDAL.' }],
  ['apple music', { description: 'Listen to your library and playlists on Apple Music.' }],
  ['qobuz', { description: 'Discover albums and listen to music on Qobuz.' }],
]);
const aliases = new Map([
  ['vacuumtube', 'youtube'], ['bigbox', 'big box'], ['vlc media player', 'vlc'],
  ['epicgameslauncher', 'epic games launcher'], ['epic games', 'epic games launcher'],
  ['galaxyclient', 'gog galaxy'], ['disneyplus', 'disney+'], ['applemusic', 'apple music'],
]);
const packages = new Map([
  ['4df9e0f8.netflix', 'netflix'],
  ['spotifyab.spotifymusic', 'spotify'],
]);

function knownName(name: string): KnownApp | undefined {
  const normalized = name.trim().toLowerCase();
  return knownApps.get(aliases.get(normalized) ?? normalized);
}

function targetApp(target?: Target): KnownApp | undefined {
  if (!target) return;
  if (target.kind === 'executable' || target.kind === 'shortcut') {
    const filename = target.value.split(/[\\/]/).pop() ?? '';
    return knownName(filename.replace(/\.(exe|lnk)$/i, ''));
  }
  if (target.kind === 'packaged') {
    const brand = packages.get(target.value.toLowerCase().split('_')[0]!);
    return brand ? knownApps.get(brand) : undefined;
  }
  try {
    const url = new URL(target.value);
    if (url.protocol === 'spotify:') return knownApps.get('spotify');
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return;
    for (const [domain, brand] of [
      ['netflix.com', 'netflix'], ['youtube.com', 'youtube'],
      ['youtu.be', 'youtube'], ['spotify.com', 'spotify'],
    ]) {
      if (url.hostname === domain || url.hostname.endsWith(`.${domain}`))
        return knownApps.get(brand!);
    }
  } catch { /* An unrecognized target keeps its native icon. */ }
}

function identifyApp(name: string, target?: Target) {
  return targetApp(target) ?? knownName(name);
}

export function appDescription(name: string, target?: Target): string {
  const app = identifyApp(name, target);
  return app ? t(app.description) : '';
}

// Resolve identity independently of the editable artwork theme. Bundled logos
// stay sharp offline and take priority over small Windows shell icons.
export function appLogoCandidates(name: string, target?: Target, icon?: string): string[] {
  const brand = identifyApp(name, target)?.logo;
  return [...new Set([brand, icon].filter((src): src is string => !!src))];
}
