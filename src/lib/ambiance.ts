import type { Settings, Theme } from './types';

export const generalAmbiances = [
  { id: 'home', name: 'Salon', description: 'Chaleur ambrée' },
  { id: 'spotify', name: 'Émeraude', description: 'Lumière verte, esprit Spotify' },
  { id: 'night', name: 'Nuit', description: 'Bleu profond, pluie en ville' },
  { id: 'dusk', name: 'Crépuscule', description: 'Cuivre et lumière douce' },
] as const;

export function backgroundFor(theme: Theme, customImage: string, settings: Pick<Settings, 'dynamicBackground' | 'generalAmbiance'>) {
  const general = generalAmbiances.some(a => a.id === settings.generalAmbiance)
    ? settings.generalAmbiance : 'home';
  if (!settings.dynamicBackground) return `/art/${general}.webp`;
  if (customImage) return customImage;
  return `/art/${theme === 'home' || theme === 'windows' ? general : theme}.webp`;
}
