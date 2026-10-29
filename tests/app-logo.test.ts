import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { appLogoCandidates } from '../src/lib/app-logo';
import type { Target } from '../src/lib/types';

const target = (kind: Target['kind'], value: string): Target => ({ kind, value, args: [], workingDir: null });
const native = 'https://asset.localhost/icons/cached.png';

describe('application card identity', () => {
  it('keeps the same bundled logos before and after Windows import', () => {
    for (const name of ['Netflix', 'YouTube', 'Spotify', 'Steam', 'Plezy', 'Silo']) {
      const [logo] = appLogoCandidates(name);
      expect(existsSync(`public${logo}`)).toBe(true);
      expect(appLogoCandidates(name, undefined, native)).toEqual([logo, native]);
    }
  });

  it.each([
    ['executable', 'C:\\Apps\\Spotify\\Spotify.exe', 'spotify.png'],
    ['executable', 'C:/Apps/VacuumTube/VacuumTube.exe', 'youtube.svg'],
    ['shortcut', 'C:\\Start Menu\\Steam.lnk', 'steam.svg'],
    ['packaged', '4DF9E0F8.Netflix_mcm4njqhnhss8!Netflix.App', 'netflix.svg'],
    ['packaged', 'SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify', 'spotify.png'],
    ['uri', 'https://www.youtube.com/tv', 'youtube.svg'],
    ['uri', 'https://open.spotify.com/', 'spotify.png'],
    ['uri', 'spotify:home', 'spotify.png'],
  ] as const)('recognizes renamed apps from %s targets: %s', (kind, value, logo) => {
    expect(appLogoCandidates('Living room', target(kind, value), native)).toEqual([`/brands/${logo}`, native]);
  });

  it('uses target identity even if a card is renamed to another brand', () => {
    expect(appLogoCandidates('Netflix', target('executable', 'C:/Apps/Spotify.exe'), native)[0]).toBe('/brands/spotify.png');
    expect(appLogoCandidates('  SPOTIFY  ', undefined, native)[0]).toBe('/brands/spotify.png');
  });

  it.each([
    ['executable', 'C:/Steam/steamapps/common/Game/game.exe'],
    ['executable', 'C:/Apps/notspotify.exe'],
    ['packaged', 'FakeSpotify_123!App'],
    ['uri', 'steam://rungameid/123'],
    ['uri', 'https://youtube.com.example.org/'],
    ['uri', 'https://example.org/netflix'],
    ['uri', 'invalid'],
  ] as const)('keeps native icons for unknown apps without guessing from paths: %s %s', (kind, value) => {
    expect(appLogoCandidates('My app', target(kind, value), native)).toEqual([native]);
  });

  it('allows the text fallback when no logo or icon is available', () => {
    expect(appLogoCandidates('My app')).toEqual([]);
    expect(appLogoCandidates('VacuumTube')).toEqual(['/brands/youtube.svg']);
  });
});
