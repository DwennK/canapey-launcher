import { targetKey, type AppEntry, type Config } from './types';
import type { AppCategory } from './library';

export interface RemovedApp {
  app: AppEntry;
  index: number;
  favorite: boolean;
  category?: AppCategory;
}

export function removeLibraryApp(config: Config, id: string) {
  const index = config.apps.findIndex(app => app.id === id);
  if (index < 0) return null;
  const library = config.settings.library;
  const removed: RemovedApp = {
    app: config.apps[index]!, index, favorite: library.favorites.includes(id),
    category: Object.hasOwn(library.categories, id) ? library.categories[id] : undefined,
  };
  const apps = config.apps.filter(app => app.id !== id);
  const categories = { ...library.categories };
  delete categories[id];
  return { removed, config: {
    ...config, apps,
    selectedId: config.selectedId === id ? apps[Math.min(index, apps.length - 1)]?.id ?? null : config.selectedId,
    settings: { ...config.settings, library: { ...library, categories, favorites: library.favorites.filter(value => value !== id) } },
  } };
}

export function restoreLibraryApp(config: Config, removed: RemovedApp): Config {
  if (config.apps.some(app => app.id === removed.app.id || targetKey(app.target) === targetKey(removed.app.target)))
    throw new Error('Cette application est déjà dans la bibliothèque.');
  if (config.apps.length >= 250) throw new Error('La bibliothèque est pleine. Retirez une carte avant de restaurer celle-ci.');
  const apps = [...config.apps];
  apps.splice(Math.min(removed.index, apps.length), 0, removed.app);
  const library = config.settings.library;
  return {
    ...config, apps, selectedId: removed.app.id,
    settings: { ...config.settings, library: {
      ...library,
      favorites: removed.favorite ? [...new Set([...library.favorites, removed.app.id])] : library.favorites,
      categories: removed.category ? { ...library.categories, [removed.app.id]: removed.category } : library.categories,
    } },
  };
}
