import { describe, expect, it } from 'vitest';
import { pairingSeconds, validTvMac, validTvPin, tvPairMode, tvFamily } from '../src/lib/tv';
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

describe('TV connection families', () => {
  it('keeps saved Philips TVs compatible and chooses the right authorization flow', () => {
    const tv = {name: 'TV', ip: '192.168.1.20', mac: null};
    expect(tvPairMode(tv)).toBe('pin');
    expect(tvFamily(tv)).toBe('Philips');
    expect(tvPairMode({...tv, protocol: 'lgWebos'})).toBe('approval');
    expect(tvPairMode({...tv, protocol: 'samsungTizen'})).toBe('approval');
    expect(tvPairMode({...tv, protocol: 'sonyBravia'})).toBe('psk');
    expect(tvPairMode({...tv, protocol: 'roku'})).toBe('network');
    expect(tvFamily({...tv, protocol: 'roku'})).toBe('Roku TV');
  });
});
