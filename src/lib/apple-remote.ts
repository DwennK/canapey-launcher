import { t } from './i18n';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
export interface AppleRemoteSettings { enabled: boolean; name: string; interface: string | null }
export interface AppleRemoteStatus {
  available: boolean; running: boolean; networks: { id: string; label: string; address: string }[];
  address: string | null; error: string | null;
  pairing: { pin: string | null; secondsRemaining: number; devices: { id: string; connected: boolean }[] };
}
export const defaultAppleRemote = (): AppleRemoteSettings => ({ enabled: false, get name() { return t('Canapey — Living room'); }, interface: null });
export const emptyAppleRemoteStatus = (): AppleRemoteStatus => ({ available: false, running: false, networks: [], address: null, error: null, pairing: { pin: null, secondsRemaining: 0, devices: [] } });
export const appleRemoteStatus = () => invoke<AppleRemoteStatus>('apple_remote_status');
export const pairAppleRemote = () => invoke<void>('apple_remote_pair');
export const cancelApplePairing = () => invoke<void>('apple_remote_cancel_pairing');
export const forgetAppleRemote = (id: string) => invoke<void>('apple_remote_forget', { id });
export const onAppleRemoteStatus = (callback: (status: AppleRemoteStatus) => void) => listen<AppleRemoteStatus>('apple-remote-status', e => callback(e.payload));
