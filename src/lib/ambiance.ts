import { t } from './i18n';
import type { Settings, Theme } from './types';

export const generalAmbiances = [
  { id: 'home', get name() { return t('Living room'); }, get description() { return t('Amber warmth'); } },
  { id: 'spotify', get name() { return t('Emerald'); }, get description() { return t('Green light, Spotify atmosphere'); } },
  { id: 'night', get name() { return t('Night'); }, get description() { return t('Deep blue, city rain'); } },
  { id: 'dusk', get name() { return t('Dusk'); }, get description() { return t('Copper and soft light'); } },
  { id: 'launchbox', get name() { return t('Arcade'); }, get description() { return t('Warm light, retro games'); } },
] as const;

export function backgroundFor(theme: Theme, customImage: string, settings: Pick<Settings, 'dynamicBackground' | 'generalAmbiance'>) {
  const general = generalAmbiances.some(a => a.id === settings.generalAmbiance)
    ? settings.generalAmbiance : 'home';
  if (!settings.dynamicBackground) return `/art/${general}.webp`;
  if (customImage) return customImage;
  return `/art/${theme === 'home' || theme === 'windows' ? general : theme}.webp`;
}

// Keep imported artwork first, then recover with bundled art if the file moves
// or cannot be decoded. Utility cards intentionally have no artwork.
export function cardArtwork(theme: Theme, customImage = '') {
  return [...new Set([customImage, `/art/${theme === 'windows' ? 'home' : theme}-card.webp`, '/art/home-card.webp'].filter(Boolean))];
}

export function backgroundCandidates(theme: Theme, customImage: string, settings: Pick<Settings, 'dynamicBackground' | 'generalAmbiance'>) {
  return [...new Set([
    backgroundFor(theme, customImage, settings),
    backgroundFor(theme, '', settings),
    backgroundFor('home', '', settings),
    '/art/home.webp',
  ])];
}
