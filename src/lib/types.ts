export type Theme =
  | "home"
  | "youtube"
  | "netflix"
  | "spotify"
  | "internet"
  | "plezy"
  | "steam"
  | "silo"
  | "windows";
export type Target = {
  kind: "executable" | "shortcut" | "uri" | "packaged";
  value: string;
  args: string[];
  workingDir: string | null;
};
export interface AppEntry {
  id: string;
  name: string;
  target: Target;
  theme: Theme;
  card: string | null;
  background: string | null;
  icon: string | null;
  source: string;
}
export interface Settings {
  locale: import("./i18n").Locale | null;
  library: import("./library").LibraryPreferences;
  lastSettingsTab: string;
  fullscreen: boolean;
  autostart: boolean;
  monitor: string | null;
  scale: number;
  motion: boolean;
  sound: boolean;
  soundVolume: number;
  dynamicBackground: boolean;
  generalAmbiance: "home" | "spotify" | "night" | "dusk";
  backgroundBrightness: number;
  backgroundBlur: number;
  deadzone: number;
  returnShortcut: "xbox" | "startBack" | "shouldersStart" | "disabled";
  remoteHome: RemoteShortcut | null; // Legacy Home-only configuration, migrated on load.
  remoteBindings: RemoteBinding[];
  appleRemote?: import("./apple-remote").AppleRemoteSettings;
  holdMs: number;
}
export interface RemoteShortcut {
  code: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
}
export type RemoteAction = 'home' | 'up' | 'down' | 'left' | 'right' | 'accept' | 'back' | 'menu' | 'options' | 'library' | 'audio' | 'power' | 'desktop' | 'taskView' | 'closeWindow' | 'escape' | 'launch' | 'volumeUp' | 'volumeDown' | 'mute' | 'playPause' | 'previousTrack' | 'nextTrack' | 'stop';
export interface RemoteBinding {
  button: string;
  key: RemoteShortcut;
  action: RemoteAction;
  global: boolean;
  appId: string | null;
}
export interface Config {
  version: number;
  apps: AppEntry[];
  selectedId: string | null;
  settings: Settings;
}
export interface Session {
  appId: string;
  name: string;
  status: "starting" | "running" | "untracked" | "closing";
  canForce: boolean;
}
export interface Monitor {
  id: string;
  name: string;
  primary: boolean;
}
export interface ControllerSnapshot {
  name: string | null;
  buttons: string[];
  axes: [number, number, number, number];
  triggers: [number, number];
  direction: "left" | "right" | "up" | "down" | null;
}
export interface Boot {
  config: Config;
  warning: string | null;
  version: string;
  native: boolean;
  sessions: Session[];
  controller: string | null;
}
export interface UpdateInfo {
  state: "disabled" | "available" | "current";
  version?: string;
  notes?: string;
}
export type Action =
  | "left"
  | "right"
  | "up"
  | "down"
  | "accept"
  | "accept-down"
  | "accept-up"
  | "accept-cancel"
  | "options"
  | "back"
  | "menu"
  | "home";
export const defaults = (): Config => ({
  version: 1,
  apps: [],
  selectedId: null,
  settings: {
    locale: null,
    library: { favorites: [], categories: {}, sort: "custom" },
    lastSettingsTab: "display",
    fullscreen: true,
    autostart: false,
    monitor: null,
    scale: 1,
    motion: true,
    sound: true,
    soundVolume: 0.5,
    dynamicBackground: true,
    generalAmbiance: "home",
    backgroundBrightness: 1,
    backgroundBlur: 0,
    deadzone: 0.24,
    returnShortcut: "xbox",
    remoteHome: null,
    remoteBindings: [],
    appleRemote: { enabled: false, name: 'Canapey — Living room', interface: null },
    holdMs: 1200,
  },
});
export const themeFor = (name: string): Theme => {
  const n = name.toLowerCase();
  return (
    (
      [
        "youtube",
        "netflix",
        "spotify",
        "internet",
        "plezy",
        "steam",
        "silo",
      ] as Theme[]
    ).find((t) => new RegExp(`\\b${t}\\b`, "i").test(n)) ?? "home"
  );
};

export function targetKey(t: Target): string {
  let value = t.value.replaceAll("/", "\\").toLowerCase();
  if (t.kind === "uri") {
    try {
      value = new URL(t.value).href;
    } catch {
      value = t.value;
    }
  }
  return JSON.stringify([
    t.kind,
    value,
    t.args,
    (t.workingDir ?? "").replaceAll("/", "\\").toLowerCase(),
  ]);
}

export interface AudioOutput {
  id: string;
  name: string;
}
export interface AudioState {
  outputs: AudioOutput[];
  defaultId: string | null;
  volume: number | null;
  muted: boolean;
}
export type AudioChange =
  | { kind: "volume"; id: string; value: number }
  | { kind: "mute"; id: string; value: boolean }
  | { kind: "output"; id: string };
