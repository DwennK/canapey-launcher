export type NoteBlock = { kind: 'heading' | 'paragraph'; text: string } | { kind: 'list'; items: string[] };
export function parseReleaseNotes(notes: string): NoteBlock[] {
  const blocks: NoteBlock[] = [];
  let separated = true;
  for (const raw of notes.replace(/\r/g, '').split('\n')) {
    const line = raw.trim();
    if (!line || /^[-*_]{3,}$/.test(line)) { separated = true; continue; }
    const heading = /^#{1,6}\s+(.+)$/.exec(line);
    const item = /^(?:[-*+] |\d+[.)] )(.+)$/.exec(line);
    const previous = blocks.at(-1);
    if (heading) blocks.push({ kind: 'heading', text: heading[1]! });
    else if (item) {
      if (previous?.kind === 'list' && !separated) previous.items.push(item[1]!);
      else blocks.push({ kind: 'list', items: [item[1]!] });
    } else if (!separated && previous?.kind === 'paragraph') previous.text += ` ${line}`;
    else if (!separated && previous?.kind === 'list') previous.items[previous.items.length - 1] += ` ${line}`;
    else blocks.push({ kind: 'paragraph', text: line });
    separated = false;
  }
  return blocks;
}
export function noteFragments(text: string) {
  // Render text nodes, never HTML supplied by release notes.
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g).filter(Boolean).map(part => {
    if (part.startsWith('**') && part.endsWith('**')) return { kind: 'strong', text: part.slice(2, -2) };
    if (part.startsWith('`') && part.endsWith('`')) return { kind: 'code', text: part.slice(1, -1) };
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    return { kind: 'text', text: link ? `${link[1]} (${link[2]})` : part };
  });
}
