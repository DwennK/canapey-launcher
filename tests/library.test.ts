import { describe, expect, it } from 'vitest';
import { categoryFor, defaultLibrary, normalizeLibrary, homeApps, groupLibraryCards } from '../src/lib/library';
import type { AppEntry, Session } from '../src/lib/types';

const app = (id: string, name: string): AppEntry => ({ id, name, target: { kind: 'uri', value: `https://example.com/${id}`, args: [], workingDir: null }, theme: 'home', card: null, background: null, icon: null, source: 'test' });
const apps = [app('music', 'Spotify'), app('game', 'Steam'), app('video', 'Netflix'), app('other', 'Éditeur')];

describe('living-room library', () => {
  it('recovers malformed browser preferences and does not inherit category keys', () => {
    expect(normalizeLibrary(null)).toEqual(defaultLibrary());
    expect(normalizeLibrary({ siloHomePosition: 0 }).siloHomePosition).toBe(0);
    expect(normalizeLibrary({ siloHomePosition: -1 })).toEqual(defaultLibrary());
    expect(normalizeLibrary({ favorites: ['a', 'a', 7], categories: { a: 'bad', b: 'music' }, sort: 'bad' })).toEqual({favorites:['a'],categories:{b:'music'},sort:'custom'});
    expect(categoryFor(app('constructor', 'Unknown'), defaultLibrary())).toBe('other');
  });
  it('keeps running apps first, deduplicates favorites and ignores stale IDs', () => {
    const preferences = { ...defaultLibrary(), favorites: ['game', 'music', 'removed'] };
    const sessions: Session[] = [{ appId: 'music', name: 'Spotify', status: 'running', canForce: false }];
    expect(homeApps(apps, preferences, sessions).map(app => app.id)).toEqual(['music', 'game']);
    expect(homeApps(apps, preferences, []).map(app => app.id)).toEqual(['music', 'game']);
  });
  it('offers a bounded starting selection without requiring favorites', () => {
    const many = Array.from({ length: 20 }, (_, i) => app(String(i), `App ${i}`));
    expect(homeApps(many, defaultLibrary(), [])).toEqual(many.slice(0, 6));
    expect(homeApps([], defaultLibrary(), [])).toEqual([]);
  });
  it('combines filters and sorting without reordering storage', () => {
    const preferences = { ...defaultLibrary(), sort: 'name' as const, favorites: ['game'] };
    const cards = apps.map(app => ({ ...app, category: categoryFor(app, preferences), favorite: preferences.favorites.includes(app.id) }));
    const groups = groupLibraryCards(cards, preferences.sort);
    expect(groups.favorites.map(app => app.id)).toEqual(['game']);
    expect(groups.all.map(app => app.id)).toEqual(['other', 'video', 'music', 'game']);
    expect(apps.map(app => app.id)).toEqual(['music', 'game', 'video', 'other']);
  });
  it('honors category overrides without using decorative artwork as identity', () => {
    const preferences = defaultLibrary();
    const renamed = { ...apps[3]!, theme: 'steam' as const };
    expect(categoryFor(renamed, preferences)).toBe('other');
    preferences.categories.other = 'games';
    expect(categoryFor(renamed, preferences)).toBe('games');
    expect(categoryFor(apps[3]!, preferences)).toBe('games');
  });
  it('includes catalog cards in video counts and name sorting', () => {
    const cards = [
      { name: 'VLC', category: 'video', favorite: true },
      { name: 'YouTube', category: 'video', favorite: false },
      { name: 'Silo', category: 'video', favorite: false },
    ] as const;
    const groups = groupLibraryCards(cards, 'name');
    expect(groups.all).toEqual([cards[2], cards[0], cards[1]]);
    expect(groups.video).toEqual(groups.all);
    expect(groups.favorites).toEqual([cards[0]]);
  });
});
