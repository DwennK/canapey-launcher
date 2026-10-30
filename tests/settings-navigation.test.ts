import { describe, expect, it } from 'vitest';
import { settingsPages, settingsChildren, settingsParent, settingsBranch, isSettingsPage, type SettingsRoute } from '../src/lib/settings-navigation';
import english from '../src/locales/en.json';
import { settingsEntry } from '../src/lib/settings-navigation';
describe('settings hierarchy', () => {
  it('makes every page reachable with a consistent parent and translated copy', () => {
    const visited = new Set<SettingsRoute>();
    const visit = (route: SettingsRoute) => {
      expect(visited.has(route)).toBe(false);
      visited.add(route);
      const entry = settingsEntry(route);
      expect(english).toHaveProperty(entry.title);
      expect(english).toHaveProperty(entry.description);
      for (const child of settingsChildren(route)) {
        expect(settingsParent(child)).toBe(route);
        visit(child);
      }
    };
    visit('root');
    for (const page of Object.keys(settingsPages)) expect(visited.has(page as SettingsRoute)).toBe(true);
    expect(settingsParent('root')).toBe(null);
  });
  it('recovers a remembered category without accepting arbitrary stored routes', () => {
    expect(settingsBranch('tv')).toBe('devices');
    expect(settingsBranch('sound')).toBe('appearance');
    expect(settingsBranch('apps')).toBe('apps');
    expect(settingsBranch('missing')).toBe('appearance');
    expect(isSettingsPage('toString')).toBe(false);
  });
});
