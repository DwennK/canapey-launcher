import { describe, expect, it, vi, afterEach } from 'vitest';
import { detectLocale, resolveLocale, setLocale, t } from '../src/lib/i18n';
import { defaults } from '../src/lib/types';
import { boot } from '../src/lib/bridge';

afterEach(() => vi.unstubAllGlobals());
describe('language selection', () => {
  it('matches system language variants and falls back to English', () => {
    for (const languages of [[], ['fr-CH'], ['en-US'], ['en_GB'], ['de', 'EN-us']]) {
      expect(detectLocale(languages)).toBe('en');
    }
    expect(resolveLocale('en', ['fr'])).toBe('en');
    expect(resolveLocale('unknown', ['de'])).toBe('en');
    expect(resolveLocale(null, [])).toBe('en');
  });
  it('interpolates data literally and preserves missing placeholders', () => {
    setLocale('en');
    expect(t('Hello {0}, {1}', ['$& <script>'])).toBe('Hello $& <script>, {1}');
  });
  it('migrates old settings once without changing the library', async () => {
    const original = defaults();
    original.apps = [{id:'custom',name:'Mon cinéma',theme:'home',target:{kind:'uri',value:'https://example.com',args:[],workingDir:null},card:null,background:null,icon:null,source:'user'}];
    delete (original.settings as Partial<typeof original.settings>).locale;
    let saved = JSON.stringify(original);
    const setItem = vi.fn((_key: string, value: string) => { saved = value; });
    vi.stubGlobal('localStorage', {getItem: () => saved, setItem});
    vi.stubGlobal('navigator', {languages:['fr-CH']});
    vi.stubGlobal('document', {documentElement:{lang:''}});
    const first = await boot();
    expect(first.config.settings.locale).toBe('en');
    expect(first.config.apps).toEqual(original.apps);
    expect(document.documentElement.lang).toBe('en');
    expect(setItem).toHaveBeenCalledTimes(1);
    const second = await boot();
    expect(second.config).toEqual(first.config);
    expect(setItem).toHaveBeenCalledTimes(1);
  });
});
