import { t, locale } from './i18n';
import type { AppEntry, Session } from './types';

export const categories = { get games() { return t('Games'); }, get video() { return t('Video'); }, get music() { return t('Music'); }, get other() { return t('Other'); } } as const;
export type AppCategory = keyof typeof categories;
export type LibraryFilter = 'all' | 'favorites' | AppCategory;
export type LibrarySort = 'custom' | 'name' | 'category';
export interface LibraryPreferences {
  favorites: string[];
  categories: Record<string, AppCategory>;
  sort: LibrarySort;
  siloHomePosition?: number;
}
export const defaultLibrary = (): LibraryPreferences => ({ favorites: [], categories: {}, sort: 'custom' });
export function normalizeLibrary(value: unknown): LibraryPreferences {
  const result = defaultLibrary();
  if (!value || typeof value !== 'object') return result;
  const input = value as Partial<LibraryPreferences>;
  if (Array.isArray(input.favorites)) result.favorites = [...new Set(input.favorites.filter(id => typeof id === 'string' && id.length > 0 && id.length <= 100))].slice(0, 250);
  if (input.categories && typeof input.categories === 'object' && !Array.isArray(input.categories)) {
    result.categories = Object.fromEntries(Object.entries(input.categories).filter(([id, category]) => id.length > 0 && id.length <= 100 && Object.hasOwn(categories, category)).slice(0, 250));
  }
  if (typeof input.siloHomePosition === 'number' && Number.isSafeInteger(input.siloHomePosition) && input.siloHomePosition >= 0) result.siloHomePosition = input.siloHomePosition;
  if (input.sort && ['custom', 'name', 'category'].includes(input.sort)) result.sort = input.sort;
  return result;
}
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();

export function categoryFor(app: AppEntry, preferences: LibraryPreferences): AppCategory {
  if (Object.hasOwn(preferences.categories, app.id)) return preferences.categories[app.id]!;
  // Artwork is a personal choice, not the application's identity.
  const identity = `${app.name} ${app.target.value}`.toLowerCase();
  if (/\b(launchbox|big\s?box|steam|xbox|epic games|gog|battle\.net)\b/.test(identity)) return 'games';
  if (/\b(netflix|youtube|plezy|silo|plex|vlc|disney|prime video)\b/.test(identity)) return 'video';
  if (/\b(spotify|deezer|tidal|apple music|qobuz)\b/.test(identity)) return 'music';
  return 'other';
}

interface LibraryCard {
  name: string;
  category: AppCategory;
  favorite: boolean;
  searchAlias?: string;
}

export function groupLibraryCards<T extends LibraryCard>(cards: readonly T[], sort: LibrarySort, query: string) {
  const text = normalize(query.trim());
  const all = cards.filter(card => normalize(card.name).includes(text) ||
    (card.searchAlias && normalize(card.searchAlias).includes(text)));
  const byName = (a: T, b: T) => a.name.localeCompare(b.name, locale.value, { numeric: true, sensitivity: 'base' });
  if (sort === 'name') all.sort(byName);
  if (sort === 'category') all.sort((a, b) =>
    categories[a.category].localeCompare(categories[b.category], locale.value) || byName(a, b));
  const groups: Record<LibraryFilter, T[]> = { all, favorites: [], games: [], video: [], music: [], other: [] };
  for (const card of all) {
    groups[card.category].push(card);
    if (card.favorite) groups.favorites.push(card);
  }
  return groups;
}

export function homeApps(apps: AppEntry[], preferences: LibraryPreferences, sessions: Session[]) {
  const active = new Set(sessions.map(session => session.appId));
  const running = apps.filter(app => active.has(app.id));
  const favorites = apps.filter(app => preferences.favorites.includes(app.id) && !active.has(app.id));
  return running.length || favorites.length ? [...running, ...favorites] : apps.slice(0, 6);
}
