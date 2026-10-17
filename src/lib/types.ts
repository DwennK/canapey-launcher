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
  fullscreen: boolean;
  autostart: boolean;
  monitor: string | null;
  scale: number;
  motion: boolean;
  sound: boolean;
  deadzone: number;
  returnShortcut: "xbox" | "startBack" | "shouldersStart" | "disabled";
  holdMs: number;
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
    fullscreen: true,
    autostart: false,
    monitor: null,
    scale: 1,
    motion: true,
    sound: true,
    deadzone: 0.24,
    returnShortcut: "xbox",
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
