import { describe, expect, it } from 'vitest';
import { defaults, type AppEntry } from '../src/lib/types';
import { removeLibraryApp, restoreLibraryApp } from '../src/lib/library-editing';

const app = (id: string): AppEntry => ({ id, name: id, target: { kind: 'uri', value: `https://example.com/${id}`, args: [], workingDir: null }, theme: 'home', card: null, background: null, icon: null, source: 'test' });
const fixture = () => {
  const config = defaults();
  config.apps = ['a', 'b', 'c'].map(app);
  config.selectedId = 'b';
  config.settings.library.favorites = ['b'];
  config.settings.library.categories.b = 'games';
  return config;
};

describe('reversible library removal', () => {
  it('removes metadata and selects a neighbor without mutating the saved snapshot', () => {
    const config = fixture();
    const result = removeLibraryApp(config, 'b')!;
    expect(result.config.apps.map(app => app.id)).toEqual(['a', 'c']);
    expect(result.config.selectedId).toBe('c');
    expect(result.config.settings.library.favorites).toEqual([]);
    expect(result.config.settings.library.categories).toEqual({});
    expect(config).toEqual(fixture());
  });
  it('restores original metadata and position without reverting subsequent edits', () => {
    const { config, removed } = removeLibraryApp(fixture(), 'b')!;
    config.settings.sound = false;
    config.settings.library.favorites.push('c');
    config.settings.library.categories.a = 'music';
    config.apps.push(app('d'));
    const restored = restoreLibraryApp(config, removed);
    expect(restored.apps.map(app => app.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(restored.settings.library.favorites).toEqual(['c', 'b']);
    expect(restored.settings.library.categories).toEqual({a:'music', b:'games'});
    expect(restored.settings.sound).toBe(false);
    expect(restored.selectedId).toBe('b');
    expect(config.apps.map(app => app.id)).toEqual(['a', 'c', 'd']);
  });
  it('handles the last card and an unknown removal', () => {
    const config = fixture(); config.apps = [app('b')];
    const result = removeLibraryApp(config, 'b')!;
    expect(result.config.selectedId).toBeNull();
    expect(restoreLibraryApp(result.config, result.removed).apps).toEqual(config.apps);
    expect(removeLibraryApp(config, 'missing')).toBeNull();
  });
  it('refuses duplicate identities, equivalent targets and a full library without changes', () => {
    const {config, removed} = removeLibraryApp(fixture(), 'b')!;
    config.apps.push({...app('replacement'), target: removed.app.target});
    expect(() => restoreLibraryApp(config, removed)).toThrow('already');
    config.apps = [app('b')];
    expect(() => restoreLibraryApp(config, removed)).toThrow('already');
    config.apps = Array.from({length:250}, (_, i) => app(String(i)));
    expect(() => restoreLibraryApp(config, removed)).toThrow('full');
    expect(config.apps).toHaveLength(250);
  });
});
