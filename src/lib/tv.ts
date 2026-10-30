import { invoke } from '@tauri-apps/api/core';
export interface Television { name: string; ip: string; mac: string | null }
export interface TvStatus {
  available: boolean; tv: Television | null; autoWake: boolean; autoStandby: boolean;
  waking: boolean; resumeAvailable: boolean; message: string | null; error: string | null;
}
export interface TvPairStarted { secondsRemaining: number; name: string }
export const emptyTvStatus = (): TvStatus => ({ available: false, tv: null, autoWake: false, autoStandby: false, waking: false, resumeAvailable: false, message: null, error: null });
export const tvStatus = () => invoke<TvStatus>('tv_status');
export const discoverTvs = () => invoke<Television[]>('tv_discover');
export const inspectTv = (ip: string) => invoke<Television>('tv_inspect', { ip });
export const pairTv = (tv: Television) => invoke<TvPairStarted>('tv_pair', { tv });
export const finishTvPairing = (pin: string) => invoke<TvStatus>('tv_pair_finish', { pin });
export const cancelTvPairing = () => invoke<void>('tv_cancel_pairing');
export const saveTvPreferences = (autoWake: boolean, autoStandby: boolean) => invoke<TvStatus>('tv_preferences', { autoWake, autoStandby });
export const forgetTv = () => invoke<TvStatus>('tv_forget');
export const wakeTv = () => invoke<TvStatus>('tv_wake');
export const standbyTv = () => invoke<TvStatus>('tv_standby');
export function pairingSeconds(deadline: number, now = Date.now()) { return Math.max(0, Math.ceil((deadline - now) / 1000)); }
export function validTvPin(pin: string) { return /^\d{4}$/.test(pin); }
export function validTvMac(mac: string) {
  if (!/^(?:[\da-f]{2}[:-]){5}[\da-f]{2}$/i.test(mac)) return false;
  const parts = mac.split(/[:-]/).map(v => parseInt(v, 16));
  return parts.some(v => v !== 0) && (parts[0]! & 1) === 0;
}
