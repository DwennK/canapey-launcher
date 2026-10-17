export type ControllerFamily = 'keyboard' | 'xbox' | 'playstation' | 'nintendo';

export function controllerFamily(name: string | null | undefined): ControllerFamily {
  if (!name?.trim()) return 'keyboard';
  if (/sony|playstation|dualshock|dualsense/i.test(name) || /^wireless controller$/i.test(name.trim())) return 'playstation';
  if (/nintendo|switch|joy[ -]?con/i.test(name) || /^pro controller$/i.test(name.trim())) return 'nintendo';
  return 'xbox';
}

// Native input uses physical positions: South confirms, East goes back.
// Nintendo's printed letters are reversed relative to an Xbox controller.
export function controllerLabels(name: string | null | undefined) {
  const family = controllerFamily(name);
  const ps = family === 'playstation', nintendo = family === 'nintendo';
  return {
    family,
    device: family === 'keyboard' ? 'Clavier' : ps ? 'Manette PlayStation' : nintendo ? 'Manette Nintendo' : 'Manette Xbox / compatible',
    south: ps ? '×' : nintendo ? 'B' : 'A',
    east: ps ? '○' : nintendo ? 'A' : 'B',
    west: ps ? '□' : nintendo ? 'Y' : 'X',
    north: ps ? '△' : nintendo ? 'X' : 'Y',
    accept: family === 'keyboard' ? '↵' : ps ? '×' : nintendo ? 'B' : 'A',
    acceptName: family === 'keyboard' ? 'Entrée' : ps ? 'Croix' : nintendo ? 'B' : 'A',
    back: family === 'keyboard' ? '⌫ / esc' : ps ? '○' : nintendo ? 'A' : 'B',
    backName: family === 'keyboard' ? 'Échap' : ps ? 'Rond' : nintendo ? 'A' : 'B',
    menu: family === 'keyboard' ? 'F1' : ps ? 'Options' : nintendo ? '+' : '☰',
    select: ps ? 'Share' : nintendo ? '−' : 'Back',
    lb: ps ? 'L1' : nintendo ? 'L' : 'LB',
    rb: ps ? 'R1' : nintendo ? 'R' : 'RB',
    lt: ps ? 'L2' : nintendo ? 'ZL' : 'LT',
    rt: ps ? 'R2' : nintendo ? 'ZR' : 'RT',
  };
}
