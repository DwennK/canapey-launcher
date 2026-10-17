import { describe, expect, it } from 'vitest';
import { noteFragments, parseReleaseNotes } from '../src/lib/release-notes';

describe('release notes', () => {
  it('groups headings, wrapped paragraphs and wrapped list items', () => {
    expect(parseReleaseNotes('## Corrections\r\n\r\n- Première\r\n  suite\r\n- Seconde\r\n\r\nTexte\r\ncontinu')).toEqual([
      {kind:'heading',text:'Corrections'}, {kind:'list',items:['Première suite','Seconde']}, {kind:'paragraph',text:'Texte continu'},
    ]);
  });
  it('keeps HTML and link destinations as text instead of executable markup', () => {
    expect(noteFragments('**Important** : `setup.exe` <img onerror=x> [Lien](javascript:evil)')).toEqual([
      {kind:'strong',text:'Important'}, {kind:'text',text:' : '}, {kind:'code',text:'setup.exe'},
      {kind:'text',text:' <img onerror=x> '}, {kind:'text',text:'Lien (javascript:evil)'},
    ]);
  });
});
