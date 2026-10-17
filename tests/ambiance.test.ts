import { describe, expect, it } from 'vitest';
import { backgroundFor, generalAmbiances } from '../src/lib/ambiance';
import { defaults } from '../src/lib/types';
import { existsSync } from 'node:fs';

describe('general and application ambiances', () => {
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
