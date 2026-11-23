import { t } from './i18n';
import { targetKey, type AppEntry, type Target } from './types';

export function websiteTarget(address: string): Target {
  const value = address.trim();
  let url: URL;
  try { url = new URL(value); }
  catch { throw new Error(t('Enter a full web address starting with https:// or http://.')); }
  if (!['https:', 'http:'].includes(url.protocol) || !url.hostname ||
      url.username || url.password || /[\u0000-\u0020\u007f]/.test(value) ||
      new TextEncoder().encode(url.href).length > 32768) {
    throw new Error(t('Use an HTTP or HTTPS address without spaces or embedded login details.'));
  }
  return { kind: 'uri', value: url.href, args: [], workingDir: null };
}

export function websiteEntry(name: string, address: string, card: string | null, library: AppEntry[]): AppEntry {
  name = name.trim();
  if (!name || name.includes('\0')) throw new Error(t('Enter a name.'));
  if (new TextEncoder().encode(name).length > 100)
    throw new Error(t('This name is too long. Try a shorter one.'));
  const target = websiteTarget(address);
  if (library.some(app => targetKey(app.target) === targetKey(target)))
    throw new Error(t('This website is already in your library.'));
  if (library.length >= 250)
    throw new Error(t('A library can hold 250 apps. Select fewer apps or remove an existing card.'));
  return { id: crypto.randomUUID(), name, target, card, theme: 'internet', icon: null, background: null, source: 'Website' };
}
