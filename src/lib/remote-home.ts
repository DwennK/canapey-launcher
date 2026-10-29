import { t } from './i18n';
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { RemoteShortcut, RemoteBinding } from "./types";

export interface RemoteHomeStatus {
  available: boolean;
  active: RemoteBinding[];
  error: string | null;
}
export const remoteHomeStatus = () => invoke<RemoteHomeStatus>("remote_home_status");
export const setRemoteCapture = (enabled: boolean) => invoke<void>("set_remote_capture", { enabled });
export const onRemoteCapture = (handler: (key: RemoteShortcut) => void) =>
  listen<RemoteShortcut>("remote-home-captured", (event) => handler(event.payload));

export const shortcutHelp = t('This key cannot be reserved. Windows keys, F12 and system combinations are excluded.');
export const validRemoteShortcut = (key: RemoteShortcut) => validLocalShortcut(key);
export const canonicalCode = (code: string) => code === 'NumpadEnter' ? 'Enter' : code === 'MediaPause' ? 'Pause' : code;
export function captureShortcut(event: KeyboardEvent, global = true): RemoteShortcut | null {
  if (event.repeat || event.isComposing || ["Control", "Shift", "Alt", "Meta", "AltGraph"].includes(event.key)) return null;
  if (event.metaKey || event.getModifierState("AltGraph")) throw new Error(shortcutHelp);
  // RegisterHotKey uses logical Windows letters, not physical US keyboard positions.
  const code = /^Numpad/.test(event.code) ? (['End','Home','PageUp','PageDown','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Insert','Delete'].includes(event.key) ? event.key : canonicalCode(event.code)) : /^[a-z]$/i.test(event.key) ? `Key${event.key.toUpperCase()}`
    : /^[0-9]$/.test(event.key) ? `Digit${event.key}` : canonicalCode(event.code && event.code !== 'Unidentified' ? event.code : event.key);
  const key = { code, ctrl: event.ctrlKey, alt: event.altKey, shift: event.shiftKey };
  if (global ? !validRemoteShortcut(key) : !validLocalShortcut(key)) throw new Error(shortcutHelp);
  return key;
}
export function shortcutLabel(key: RemoteShortcut | null | undefined) {
  if (!key) return t('Not mapped');
  return [key.ctrl && "Ctrl", key.alt && "Alt", key.shift && t('Shift'), key.code.replace(/^(Key|Digit)/, "")].filter(Boolean).join(" + ");
}

export function validLocalShortcut(key: RemoteShortcut) {
  const supported = /^(Key[A-Z]|Digit[0-9]|Numpad[0-9]|F([1-9]|1[0-1]|1[3-9]|2[0-4]))$/.test(key.code)
    || ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Enter','NumpadEnter','Escape','Backspace','Space','Tab','Home','End','PageUp','PageDown','Insert','Delete','Pause','CapsLock','NumLock','ScrollLock','PrintScreen','Equal','Comma','Minus','Period','Semicolon','Slash','Backquote','BracketLeft','Backslash','BracketRight','Quote','NumpadAdd','NumpadDecimal','NumpadDivide','NumpadMultiply','NumpadSubtract','AudioVolumeUp','AudioVolumeDown','AudioVolumeMute','MediaPlay','MediaPause','MediaPlayPause','MediaStop','MediaTrackNext','MediaTrackPrevious'].includes(key.code);
  return supported && !(key.alt && ['Tab','F4'].includes(key.code)) && !(key.ctrl && key.shift && key.code === 'KeyQ') && !(key.ctrl && key.alt && ['Delete','Escape'].includes(key.code)) && !(key.ctrl && key.shift && key.code === 'Escape');
}
export const isMediaShortcut = (key: RemoteShortcut) => /^(AudioVolume|Media)/.test(key.code);
export const runRemoteAction = (button: string) => invoke<void>('run_remote_action', { button });
