import { describe, expect, it } from 'vitest';
import { backgroundFor, backgroundCandidates, cardArtwork, generalAmbiances } from '../src/lib/ambiance';
import { defaults } from '../src/lib/types';
import { existsSync } from 'node:fs';

describe('general and application ambiances', () => {
  it('provides a real bundled card and backdrop for every application theme', () => {
    for (const theme of ['home', 'netflix', 'youtube', 'spotify', 'steam', 'plezy', 'silo', 'internet', 'windows'] as const) {
      for (const path of [...cardArtwork(theme), ...backgroundCandidates(theme, '', defaults().settings)]) {
        expect(existsSync(`public${path}`), path).toBe(true);
      }
    }
  });
  it('recovers imported art through the application art and general ambiance', () => {
    const settings = {...defaults().settings, dynamicBackground:true, generalAmbiance:'night' as const};
    expect(cardArtwork('steam', '/missing.webp')).toEqual(['/missing.webp', '/art/steam-card.webp', '/art/home-card.webp']);
    expect(cardArtwork('home')).toEqual(['/art/home-card.webp']);
    expect(backgroundCandidates('steam', '/missing.webp', settings)).toEqual(['/missing.webp', '/art/steam.webp', '/art/night.webp', '/art/home.webp']);
    expect(backgroundCandidates('steam', '/missing.webp', {...settings,dynamicBackground:false})).toEqual(['/art/night.webp', '/art/home.webp']);
  });
  it('keeps the selected general ambience across app changes in fixed mode', () => {
    const settings = { ...defaults().settings, dynamicBackground: false, generalAmbiance: 'night' as const };
    expect(backgroundFor('spotify', '/custom.webp', settings)).toBe('/art/night.webp');
    expect(backgroundFor('silo', '', settings)).toBe('/art/night.webp');
  });
  it('uses app art and custom backgrounds in dynamic mode, with the general ambience on home', () => {
    const settings = { ...defaults().settings, generalAmbiance: 'dusk' as const };
    expect(backgroundFor('spotify', '', settings)).toBe('/art/spotify.webp');
    expect(backgroundFor('silo', '', settings)).toBe('/art/silo.webp');
    expect(backgroundFor('home', '', settings)).toBe('/art/dusk.webp');
    expect(backgroundFor('windows', '', settings)).toBe('/art/dusk.webp');
    expect(backgroundFor('netflix', '/custom.webp', settings)).toBe('/custom.webp');
  });
  it('provides full-size art and thumbnails for every general ambience', () => {
    for (const ambiance of generalAmbiances) {
      expect(existsSync(`public/art/${ambiance.id}.webp`)).toBe(true);
      expect(existsSync(`public/art/${ambiance.id}-card.webp`)).toBe(true);
    }
  });
});
