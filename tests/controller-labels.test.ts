import { describe, expect, it } from 'vitest';
import { controllerFamily, controllerLabels } from '../src/lib/controller-labels';

describe('controller button legends', () => {
  it.each([
    [null, 'keyboard'], ['', 'keyboard'],
    ['Xbox Wireless Controller', 'xbox'], ['XInput Controller', 'xbox'],
    ['DualSense Wireless Controller', 'playstation'], ['Wireless Controller', 'playstation'],
    ['Sony DualShock 4', 'playstation'],
    ['Nintendo Switch Pro Controller', 'nintendo'], ['Pro Controller', 'nintendo'],
    ['Joy-Con (L/R)', 'nintendo'], ['HORIPAD for Nintendo Switch', 'nintendo'],
    ['Thrustmaster eSwap Pro Controller', 'xbox'],
  ] as const)('identifies %s as %s', (name, expected) => {
    expect(controllerFamily(name)).toBe(expected);
  });
  it('labels the same physical actions across controller layouts', () => {
    expect(controllerLabels('Xbox')).toMatchObject({ accept: 'A', back: 'B', menu: '☰' });
    expect(controllerLabels('DualSense')).toMatchObject({ accept: '×', back: '○', menu: 'Options', west: '□', north: '△' });
    expect(controllerLabels('Nintendo Switch')).toMatchObject({ accept: 'B', back: 'A', menu: '+', west: 'Y', north: 'X', lt: 'ZL', rt: 'ZR' });
    expect(controllerLabels(null)).toMatchObject({ accept: '↵', back: '⌫ / esc', menu: 'F1' });
  });
});
