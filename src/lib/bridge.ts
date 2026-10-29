import { t, resolveLocale, setLocale } from './i18n';
import { version as appVersion } from "../../package.json";
export { appVersion };
import { invoke, convertFileSrc, isTauri } from "@tauri-apps/api/core";
import { normalizeLibrary } from "./library";
import { startupMark, startupTimings } from "./startup";
import { listen } from "@tauri-apps/api/event";
import {
  defaults,
  type Boot,
  type Config,
  type AppEntry,
  type Session,
  type Monitor,
  type UpdateInfo,
  type Action,
  type ControllerSnapshot,
  type RemoteBinding,
} from "./types";
export const native = isTauri();
const browserKey = "canapey-ui-preview-v1";
const unavailable = () =>
  Promise.reject(
    new Error(t('This action requires Canapey Launcher on Windows 11.')),
  );
export async function boot(): Promise<Boot> {
  if (native) {
    const result = await invoke<Boot>("bootstrap");
    await initializeLanguage(result);
    return result;
  }
  let config = defaults();
  try {
    const saved = localStorage.getItem(browserKey);
    if (saved) {
      const c = JSON.parse(saved);
      if (
        c.version === 1 &&
        Array.isArray(c.apps) &&
        c.apps.every(
          (a: AppEntry) =>
            a &&
            typeof a.id === "string" &&
            typeof a.name === "string" &&
            a.target &&
            typeof a.target.value === "string" &&
            Array.isArray(a.target.args),
        ) &&
        c.settings &&
        typeof c.settings.scale === "number" &&
        c.settings.scale >= 0.8 &&
        c.settings.scale <= 1.4
      )
        config = { ...c, settings: { ...defaults().settings, ...c.settings, library: normalizeLibrary(c.settings.library) } };
    }
  } catch {
    /* preview only */
  }
  if (config.settings.remoteHome && !config.settings.remoteBindings.length) {
    config.settings.remoteBindings = [{ button: 'home', key: config.settings.remoteHome, action: 'home', global: true, appId: null }];
    config.settings.remoteHome = null;
  }
  const result: Boot = {
    config,
    warning: null,
    version: appVersion,
    native: false,
    sessions: [],
    controller: null,
  };
  await initializeLanguage(result);
  return result;
}
async function initializeLanguage(result: Boot) {
  const previous = result.config.settings.locale;
  const chosen = resolveLocale(previous, typeof navigator === 'undefined' ? [] : navigator.languages);
  result.config.settings.locale = chosen;
  setLocale(chosen);
  if (previous !== chosen) {
    try { await save(result.config); }
    catch { result.warning = [result.warning, t('Could not save the language preference. Choose it again in Settings.')].filter(Boolean).join(' '); }
  }
}
export async function save(config: Config, remoteHomeUpdate = false): Promise<Config> {
  if (native) return invoke("save_config", { config, remoteHomeUpdate });
  localStorage.setItem(browserKey, JSON.stringify(config));
  return config;
}
export const scan = (): Promise<AppEntry[]> =>
  native ? invoke("scan_apps") : unavailable();
export const launch = (id: string): Promise<Session> =>
  native ? invoke("launch_app", { id }) : unavailable();
export const resume = (id: string): Promise<void> =>
  native ? invoke("resume_app", { id }) : unavailable();
export const closeApp = (id: string, force = false): Promise<void> =>
  native ? invoke("close_app", { id, force }) : unavailable();
export const desktop = (): Promise<void> =>
  native ? invoke("show_desktop") : unavailable();
export const power = (action: string): Promise<void> =>
  native ? invoke("power_action", { action }) : unavailable();
export const monitors = (): Promise<Monitor[]> =>
  native ? invoke("list_monitors") : Promise.resolve([]);
export const pickTarget = (): Promise<AppEntry | null> =>
  native ? invoke("pick_application") : unavailable();
export const pickImage = (
  kind: "card" | "background",
): Promise<string | null> =>
  native ? invoke("pick_image", { kind }) : unavailable();
export const checkUpdate = (): Promise<UpdateInfo> =>
  native ? invoke("check_update") : Promise.resolve({ state: "disabled" });
export const installUpdate = (): Promise<void> =>
  native ? invoke("install_update") : unavailable();
export const logs = (): Promise<void> =>
  native ? invoke("open_logs") : unavailable();
export async function ready() {
  // Show before requesting animation frames: hidden WebView2 windows may suspend rAF.
  if (native) await invoke("frontend_ready", { frontendMs: performance.now() });
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
  startupMark("painted");
  if (native) await invoke("frontend_painted", { timings: startupTimings() });
}
export const returnReady = () =>
  native ? invoke("home_ready") : Promise.resolve();
export const quit = () => (native ? invoke("quit") : unavailable());
export const setControllerTest = (enabled: boolean): Promise<void> =>
  native ? invoke("set_controller_test", { enabled }) : unavailable();
export const imageUrl = (path: string | null | undefined) =>
  path
    ? path.startsWith("/art/")
      ? path
      : native
        ? convertFileSrc(path)
        : ""
    : "";
export async function subscribe(handlers: {
  action: (v: Action) => void;
  appleInput: (v: {action: Action; connection: number}) => void;
  controller: (v: string | null) => void;
  sessions: (v: Session[]) => void;
  home: (preservePanel: boolean) => void;
  error: (v: string) => void;
  controllerSnapshot: (v: ControllerSnapshot) => void;
  controllerTestEnded: () => void;
  remoteAction: (event: {binding: RemoteBinding; pressed: boolean; cancelled?: boolean}) => void;
  updateStatus: (message: string) => void;
}) {
  if (!native) return () => {};
  const stops = await Promise.all([
    listen<{action: Action; connection: number}>("apple-input", e => handlers.appleInput(e.payload)),
    listen<Action>("input", (e) => handlers.action(e.payload)),
    listen<string>("update-status", (e) => handlers.updateStatus(e.payload)),
    listen<{binding: RemoteBinding; pressed: boolean; cancelled?: boolean}>("remote-action", e => handlers.remoteAction(e.payload)),
    listen<string | null>("controller", (e) => handlers.controller(e.payload)),
    listen<Session[]>("sessions", (e) => handlers.sessions(e.payload)),
    listen<boolean>("home", (e) => handlers.home(e.payload === true)),
    listen<string>("native-error", (e) => handlers.error(e.payload)),
    listen<ControllerSnapshot>("controller-snapshot", (e) =>
      handlers.controllerSnapshot(e.payload),
    ),
    listen("controller-test-ended", handlers.controllerTestEnded),
  ]);
  return () => stops.forEach((f) => f());
}

export const audioState = (): Promise<import("./types").AudioState> =>
  native ? invoke("audio_state") : unavailable();
export const changeAudio = (
  change: import("./types").AudioChange,
): Promise<import("./types").AudioState> =>
  native ? invoke("change_audio", { change }) : unavailable();

export interface VacuumTubeRelease { version: string; size: number; url: string; sha256: string }
export interface VacuumTubeProgress { stage: 'checking' | 'downloading' | 'installing' | 'detecting'; received: number; total: number }
export const detectYouTube = (): Promise<AppEntry | null> => native ? invoke('detect_vacuumtube') : Promise.resolve(null);
export const youtubeRelease = (): Promise<VacuumTubeRelease> => native ? invoke('vacuumtube_release') : unavailable();
export const installYouTube = (): Promise<AppEntry | null> => native ? invoke('install_vacuumtube') : unavailable();
export const cancelYouTubeInstall = (): Promise<void> => native ? invoke('cancel_vacuumtube_install') : Promise.resolve();
export const youtubeProgress = (handler: (progress: VacuumTubeProgress) => void): Promise<() => void> =>
  native ? listen<VacuumTubeProgress>('vacuumtube-progress', event => handler(event.payload)) : Promise.resolve(() => {});
