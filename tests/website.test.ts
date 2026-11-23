import { describe, expect, it } from 'vitest';
import { websiteEntry, websiteTarget } from '../src/lib/website';

describe('website shortcuts', () => {
  it('keeps paths, query strings and anchors while canonicalizing web addresses', () => {
    expect(websiteTarget(' HTTPS://EXAMPLE.com:443/Watch?q=cin%C3%A9ma#Resume ')).toEqual({
      kind: 'uri', value: 'https://example.com/Watch?q=cin%C3%A9ma#Resume', args: [], workingDir: null,
    });
    expect(websiteTarget('http://192.168.1.20:8096/web/').value).toBe('http://192.168.1.20:8096/web/');
    expect(websiteTarget('http://localhost:3000').value).toBe('http://localhost:3000/');
  });
  it('rejects non-web targets, embedded credentials, control characters and oversized URLs', () => {
    for (const url of ['', 'example.com', 'javascript:alert(1)', 'file:///C:/test', 'steam://run/1',
      'data:text/html,test', 'https://user:password@example.com', 'https://user@example.com',
      'https://exa\nmple.com', 'https://example.com/a b', `https://example.com/${'a'.repeat(32768)}`]) {
      expect(() => websiteTarget(url), url).toThrow();
    }
  });
  it('creates a normal persistent URI card without browser arguments', () => {
    const entry = websiteEntry('  My cinema  ', 'https://example.com', 'C:\\Canapey\\art\\card.webp', []);
    expect(entry).toMatchObject({ name: 'My cinema', card: 'C:\\Canapey\\art\\card.webp', theme: 'internet',
      target: { kind: 'uri', value: 'https://example.com/', args: [], workingDir: null } });
    expect(entry.id).toBeTruthy();
    expect(websiteEntry('Radio', 'https://example.com/radio', null, []).card).toBeNull();
  });
  it('detects equivalent URLs but preserves case-sensitive paths and different query strings', () => {
    const library = [websiteEntry('One', 'https://example.com', null, [])];
    expect(() => websiteEntry('Two', 'HTTPS://EXAMPLE.COM:443/', null, library)).toThrow(/already/);
    const other = [websiteEntry('Watch', 'https://example.com/Watch?q=1', null, [])];
    expect(() => websiteEntry('Other', 'https://example.com/watch?q=1', null, other)).not.toThrow();
    expect(() => websiteEntry('Other', 'https://example.com/Watch?q=2', null, other)).not.toThrow();
  });
  it('checks name and library limits before saving', () => {
    for (const name of [' ', '\0', 'a'.repeat(101), 'é'.repeat(51)])
      expect(() => websiteEntry(name, 'https://example.com', null, [])).toThrow();
    expect(() => websiteEntry('é'.repeat(50), 'https://example.com', null, [])).not.toThrow();
    const entry = websiteEntry('One', 'https://example.com', null, []);
    expect(() => websiteEntry('Two', 'https://example.org', null, Array(250).fill(entry))).toThrow(/250/);
  });
});
