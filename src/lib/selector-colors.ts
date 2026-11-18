export const selectorColors = {
  blue: { label: 'Blue', color: '#79b4ff' },
  teal: { label: 'Teal', color: '#60d2d2' },
  mint: { label: 'Mint', color: '#8edba8' },
  amber: { label: 'Amber', color: '#efc36e' },
  coral: { label: 'Coral', color: '#ff9984' },
  rose: { label: 'Rose', color: '#f49bc5' },
  lavender: { label: 'Lavender', color: '#ba9fff' },
  silver: { label: 'Silver', color: '#c4cbd5' },
} as const;

export type SelectorColor = keyof typeof selectorColors;

export function resolveSelectorColor(value: unknown): SelectorColor {
  return typeof value === 'string' && Object.hasOwn(selectorColors, value)
    ? value as SelectorColor : 'blue';
}
