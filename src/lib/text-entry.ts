export function replaceSelection(
  value: string,
  start: number,
  end: number,
  insertion: string,
  maxLength = -1,
) {
  const available =
    maxLength < 0
      ? Infinity
      : Math.max(0, maxLength - (value.length - (end - start)));
  let text = "";
  for (const character of insertion) {
    if (text.length + character.length > available) break;
    text += character;
  }
  return {
    value: value.slice(0, start) + text + value.slice(end),
    cursor: start + text.length,
  };
}
export function eraseSelection(value: string, start: number, end: number) {
  const previous = Array.from(value.slice(0, start)).at(-1)?.length ?? 0;
  return replaceSelection(
    value,
    start === end ? start - previous : start,
    end,
    "",
  );
}
