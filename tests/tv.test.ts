import { describe, expect, it } from 'vitest';
import { pairingSeconds, validTvMac, validTvPin } from '../src/lib/tv';
describe('TV setup input and expiry', () => {
  it('accepts a leading-zero PIN and rejects incomplete or nonnumeric input', () => {
    expect(validTvPin('0042')).toBe(true);
    for (const value of ['', '123', '12345', '1e03', '１２３４', ' 1234']) expect(validTvPin(value)).toBe(false);
  });
  it('expires according to elapsed wall time, including after background suspension', () => {
    expect(pairingSeconds(60_000, 0)).toBe(60);
    expect(pairingSeconds(60_000, 59_001)).toBe(1);
    expect(pairingSeconds(60_000, 60_000)).toBe(0);
    expect(pairingSeconds(60_000, 200_000)).toBe(0);
  });
  it('requires a unicast MAC and preserves the active network interface address', () => {
    expect(validTvMac('02:11:22:33:44:55')).toBe(true);
    expect(validTvMac('02-11-22-33-44-55')).toBe(true);
    for (const value of ['FF:FF:FF:FF:FF:FF','00:00:00:00:00:00','01:11:22:33:44:55','02:11:22:33:44','02:11:22:33:44:5']) expect(validTvMac(value)).toBe(false);
  });
});
