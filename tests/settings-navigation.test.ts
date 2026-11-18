import { describe, expect, it } from 'vitest';
import { findSettings, isSettingsPage, settingsPages, settingsSections } from '../src/lib/settings-navigation';
import english from '../src/locales/en.json';

describe('settings sidebar', () => {
  it('lists each page exactly once and localizes section and page names', () => {
    const pages = settingsSections.flatMap(section => [...section.pages]);
    expect([...pages].sort()).toEqual(Object.keys(settingsPages).sort());
    for (const section of settingsSections) expect(english).toHaveProperty(section.title);
    for (const page of pages) expect(english).toHaveProperty(settingsPages[page].title);
  });
  it('finds pages by task and recognizes only known saved destinations', () => {
    expect(findSettings('HdMi')).toEqual(['tv']);
    expect(findSettings('Apple pairing')).toEqual(['iphone']);
    expect(findSettings('xyz')).toEqual([]);
    expect(isSettingsPage('sound')).toBe(true);
    expect(isSettingsPage('toString')).toBe(false);
  });
});
