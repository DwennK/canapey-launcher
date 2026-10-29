import { targetKey, type AppEntry, type Config } from './types';
import type { LibraryFilter } from './library';

export const isVacuumTube = (app: AppEntry) => app.target.kind === 'executable' && /(?:^|[\\/])vacuumtube\.exe$/i.test(app.target.value);
export function showYouTubeSuggestion(apps: AppEntry[], query: string, filter: LibraryFilter) {
  return !apps.some(isVacuumTube) && ['all', 'video'].includes(filter) &&
    ['youtube', 'vacuumtube'].some(name => name.includes(query.trim().toLocaleLowerCase()));
}
export function registerYouTube(config: Config, detected: AppEntry): { config: Config; app: AppEntry } {
  if (!isVacuumTube(detected)) throw new Error('Application détectée inattendue.');
  const existing = config.apps.find(isVacuumTube) ?? config.apps.find(app => targetKey(app.target) === targetKey(detected.target));
  if (!existing && config.apps.length >= 250) throw new Error('La bibliothèque est pleine. Retirez une carte puis réessayez.');
  const app: AppEntry = {
    ...detected, ...existing, name: existing?.name === 'VacuumTube' ? 'YouTube' : existing?.name ?? 'YouTube',
    id: existing?.id ?? (config.apps.some(app => app.id === detected.id) ? crypto.randomUUID() : detected.id),
    target: { ...detected.target, args: [...new Set([...(existing?.target.args ?? detected.target.args), '--fullscreen'])] },
    theme: existing?.theme === 'home' ? 'youtube' : existing?.theme ?? 'youtube',
    icon: null, source: 'Application Windows',
  };
  const apps = existing ? config.apps.map(value => value.id === existing.id ? app : value) : [...config.apps, app];
  return {config: {...config, apps, selectedId: app.id}, app};
}
