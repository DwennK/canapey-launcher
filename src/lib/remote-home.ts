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

export const shortcutHelp = "Choisissez Ctrl + Alt + une lettre, ou une touche dédiée (Home, F2–F11, F13–F24). Flèches, Entrée et Échap restent réservés à la navigation.";
export function validRemoteShortcut(key: RemoteShortcut) {
  const f = /^F([2-9]|10|11|1[3-9]|2[0-4])$/.test(key.code);
  const dedicated = f || ["Home", "Pause"].includes(key.code);
  return (dedicated && !key.ctrl && !key.alt && !key.shift)
    || (key.ctrl && key.alt && (/^Key[A-Z]$|^Digit[0-9]$/.test(key.code) || f));
}
export function captureShortcut(event: KeyboardEvent, global = true): RemoteShortcut | null {
  if (event.repeat || event.isComposing || ["Control", "Shift", "Alt", "Meta", "AltGraph"].includes(event.key)) return null;
  if (event.metaKey || event.getModifierState("AltGraph")) throw new Error(shortcutHelp);
  // RegisterHotKey uses logical Windows letters, not physical US keyboard positions.
  const code = /^[a-z]$/i.test(event.key) ? `Key${event.key.toUpperCase()}`
    : /^[0-9]$/.test(event.key) ? `Digit${event.key}` : event.code || event.key;
  const key = { code, ctrl: event.ctrlKey, alt: event.altKey, shift: event.shiftKey };
  if (global ? !validRemoteShortcut(key) : !validLocalShortcut(key)) throw new Error(global ? shortcutHelp : "Choisissez une touche clavier. Les touches Windows, Alt + Tab, Alt + F4 et Ctrl + Maj + Q sont réservées. Pour un bouton multimédia, programmez un raccourci dédié dans Flirc.");
  return key;
}
export function shortcutLabel(key: RemoteShortcut | null | undefined) {
  if (!key) return "Non associé";
  return [key.ctrl && "Ctrl", key.alt && "Alt", key.shift && "Maj", key.code.replace(/^(Key|Digit)/, "")].filter(Boolean).join(" + ");
}

export function validLocalShortcut(key: RemoteShortcut) {
  const supported = /^(Key[A-Z]|Digit[0-9]|F([1-9]|1[0-1]|1[3-9]|2[0-4]))$/.test(key.code)
    || ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Enter','NumpadEnter','Escape','Backspace','Space','Tab','Home','End','PageUp','PageDown','Insert','Delete','Pause'].includes(key.code);
  return supported && !(key.alt && ['Tab','F4'].includes(key.code)) && !(key.ctrl && key.shift && key.code === 'KeyQ');
}
export const runRemoteAction = (button: string) => invoke<void>('run_remote_action', { button });
