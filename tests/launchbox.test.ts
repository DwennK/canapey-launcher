import { describe, expect, it } from 'vitest';
import { defaults, themeFor, type AppEntry } from '../src/lib/types';
import { categoryFor } from '../src/lib/library';
import { backgroundFor } from '../src/lib/ambiance';

describe('LaunchBox artwork and identity', () => {
  it('recognizes both interfaces without changing unrelated names', () => {
    for (const name of ['LaunchBox', 'Big Box', 'BigBox']) {
      expect(themeFor(name)).toBe('launchbox');
      const app = { name, target: { value: `C:\\Games\\LaunchBox\\${name}.exe` } } as AppEntry;
      expect(categoryFor(app, defaults().settings.library)).toBe('games');
    }
    expect(themeFor('My launchboxer')).toBe('home');
  });
  it('uses Arcade globally only when selected, preserving per-app mode', () => {
    const settings = { ...defaults().settings, generalAmbiance: 'launchbox' as const };
    expect(backgroundFor('home', '', settings)).toBe('/art/launchbox.webp');
    expect(backgroundFor('spotify', '', settings)).toBe('/art/spotify.webp');
    expect(backgroundFor('spotify', '', {...settings, dynamicBackground:false})).toBe('/art/launchbox.webp');
  });
});
