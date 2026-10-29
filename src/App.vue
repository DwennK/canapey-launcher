<script setup lang="ts">
import {
  computed, defineAsyncComponent, ref, watch, onMounted, onUnmounted, nextTick,
} from "vue";
import { categories, categoryFor, homeApps, libraryApps, type AppCategory, type LibraryFilter } from "./lib/library";
import { removeLibraryApp, restoreLibraryApp, type RemovedApp } from "./lib/library-editing";
import RemovalNotice from "./components/RemovalNotice.vue";
import { isVacuumTube, registerYouTube, showYouTubeSuggestion } from './lib/youtube';
const YouTubeSetup = defineAsyncComponent(() => import('./components/YouTubeSetup.vue'));
const youtubeDetected = ref<AppEntry | null>(null);
const youtubeBusy = ref(false);
const youtubeChecking = ref(false);
async function saveYouTube(app: AppEntry) {
  const result = registerYouTube(config.value, app);
  config.value = result.config;
  if (!(await persist())) return false;
  youtubeDetected.value = result.app;
  return true;
}
async function openYouTube(app: AppEntry) {
  if (!(await saveYouTube(app))) throw new Error('La carte YouTube n’a pas été enregistrée. Réessayez.');
  dismissPanels(); resetLibrary(); view.value = 'grid';
  await nextTick();
  selected.value = reconcileSelection(tiles.value.map(tile => tile.id), config.value.selectedId);
  await focusCard();
  const entry = config.value.apps.find(isVacuumTube)!;
  await activate({id:entry.id,name:entry.name,theme:entry.theme,entry}, true);
}
import { isSystemTool } from "./lib/discovery";
import { controllerLabels } from "./lib/controller-labels";
import { CardHold } from "./lib/hold";
import Icon from "./components/Icon.vue";
import AudioControls from "./components/AudioControls.vue";
import { createAudioControls } from "./lib/audio";
import { backgroundCandidates, generalAmbiances } from "./lib/ambiance";
import AppCard from "./components/AppCard.vue";
import { startupMark } from "./lib/startup";
import { captureShortcut, runRemoteAction } from "./lib/remote-home";
import { findRemoteBinding } from "./lib/remote-layout";
import * as api from "./lib/bridge";
import {
  defaults,
  targetKey,
  type AppEntry,
  type Action,
  type Theme,
  type Session,
  type Monitor,
  type UpdateInfo,
  type ControllerSnapshot,
  type RemoteBinding,
} from "./lib/types";
import {
  navigate,
  reconcileSelection,
  focusDirection,
  focusableItems,
  focusElement,
  isTextControl,
  rememberFocus,
  restoreFocus,
  type FocusBookmark,
} from "./lib/navigation";

const XboxHomeSettings = defineAsyncComponent(
  () => import("./components/XboxHomeSettings.vue"),
);
const AppleRemoteSettings = defineAsyncComponent(() => import("./components/AppleRemoteSettings.vue"));
const remoteDevice = ref<"flirc" | "iphone">("flirc");
async function saveAppleRemote(settings: import("./lib/apple-remote").AppleRemoteSettings) {
  config.value.settings.appleRemote = settings;
  return queueSave();
}
let appleAccept: number | null = null;
function appleInput(event: {action: Action; connection: number}) {
  if (event.action === "accept-cancel") { if (event.connection === 0 || appleAccept === event.connection) { appleAccept = null; cancelHold(); } return; }
  if (event.action === "accept-down") { if (remoteCapturing.value || appleAccept !== null) return; appleAccept = event.connection; beginAccept("iphone"); return; }
  if (event.action === "accept-up") { if (appleAccept === event.connection) { appleAccept = null; releaseAccept("iphone"); } return; }
  dispatch(event.action);
}
const RemoteHomeSettings = defineAsyncComponent(
  () => import("./components/RemoteHomeSettings.vue"),
);
const ReleaseNotes = defineAsyncComponent(() => import('./components/ReleaseNotes.vue'));
const updateStatus = ref('');
const installingUpdate = ref(false);
const appsToClose = computed(() => sessions.value.filter(session => session.status !== 'untracked'));
const remoteCapturing = ref(false);
function remoteCaptureChanged(value: boolean) {
  cancelHold();
  remoteCapturing.value = value;
}
async function saveRemoteBindings(bindings: RemoteBinding[]) {
  config.value.settings.remoteHome = null;
  config.value.settings.remoteBindings = bindings;
  return queueSave(true);
}
let remoteAcceptCode: string | null = null;
function remoteBindingFor(event: KeyboardEvent) {
  try {
    const key = captureShortcut({ key: event.key, code: event.code, ctrlKey: event.ctrlKey, altKey: event.altKey, shiftKey: event.shiftKey, metaKey: event.metaKey, repeat: false, isComposing: event.isComposing, getModifierState: (name: string) => event.getModifierState(name) } as KeyboardEvent, false);
    return key ? findRemoteBinding(config.value.settings.remoteBindings ?? [], key) : undefined;
  } catch { return undefined; }
}
function executeRemote(binding: RemoteBinding) {
  const action = binding.action;
  if (action === 'escape') dispatch('back');
  else if (['up','down','left','right','accept','back','menu','options'].includes(action)) dispatch(action as Action);
  else if (action === 'library') { dismissPanels(); view.value = 'grid'; void focusCard(); }
  else if (action === 'audio') void openAudio();
  else if (action === 'power') void openPanel('power');
  else if (action === 'home' && !native.value) dispatch('home');
  else if (native.value) void runRemoteAction(binding.button).catch(notify);
  else notify('Cette action nécessite Canapey sous Windows.');
}
// Native hotkeys arrive independently of DOM focus, including while minimized.
let remoteEventChain = Promise.resolve();
let nativeRemoteAccept: string | null = null;
function nativeRemoteAction(event: {binding: RemoteBinding; pressed: boolean; cancelled?: boolean}) {
  remoteEventChain = remoteEventChain.then(async () => {
    const {binding, pressed} = event;
    if (remoteCapturing.value) return;
    if (!pressed) {
      if (nativeRemoteAccept === binding.button) { nativeRemoteAccept = null; if (event.cancelled) cancelHold(); else releaseAccept('remote-native'); }
      return;
    }
    // Learning is handled separately; do not execute interface mappings
    // while the remote editor is open.
    if (panel.value === 'settings' && settingsTab.value === 'remote') return;
    if (!panel.value && (binding.action === 'options' || !launcherRoot.value?.contains(document.activeElement))) {
      await nextTick(); await focusCard();
    }
    if (binding.action === 'accept') {
      if (nativeRemoteAccept === binding.button) return;
      nativeRemoteAccept = binding.button; beginAccept('remote-native');
    } else if (binding.action === 'menu') {
      void openSettings();
    } else executeRemote(binding);
  }).catch(notify);
}
const OnScreenKeyboard = defineAsyncComponent(
  () => import("./components/OnScreenKeyboard.vue"),
);
const ControllerTester = defineAsyncComponent(
  () => import("./components/ControllerTester.vue"),
);

type Panel =
  | ""
  | "audio"
  | "settings"
  | "add"
  | "edit"
  | "power"
  | "session"
  | "confirm"
  | "quick"
  | "move"
  | "youtube";
interface Tile {
  id: string;
  name: string;
  theme: Theme;
  special?: string;
  suggestion?: boolean;
  catalog?: boolean;
  entry?: AppEntry;
}
const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
const osReducedMotion = ref(motionPreference.matches);
const motionChanged = (event: MediaQueryListEvent) => {
  osReducedMotion.value = event.matches;
};
motionPreference.addEventListener("change", motionChanged);
const config = ref(defaults()),
  loaded = ref(false),
  native = ref(false),
  version = ref(api.appVersion);
const audio = createAudioControls(api);
const {
  state: audioState,
  error: audioError,
  busy: audioBusy,
  volume: audioVolume,
  switching: audioSwitching,
} = audio;
const headerVolume = computed(() => audioState.value?.volume != null
  ? Math.round(audioVolume.value) : null);
const volumeDescription = computed(() => headerVolume.value === null
  ? 'Volume indisponible'
  : `${audioState.value?.muted ? 'Son coupé · ' : ''}Volume ${headerVolume.value} %`);
let audioTimer: ReturnType<typeof setInterval>;
async function openAudio() {
  void openPanel("audio");
  if (native.value) await audio.refresh(true);
}
const selected = ref(0),
  view = ref<"carousel" | "grid">("carousel"),
  panel = ref<Panel>("");
const launcherRoot = ref<HTMLElement>();
const cardsFocused = ref(false);
const editingControl = ref<HTMLElement | null>(null);
const keyboardTarget = ref<HTMLInputElement | HTMLTextAreaElement | null>(null);
const screenKeyboard = ref<InstanceType<typeof OnScreenKeyboard>>();
const keyboardEntry = ref({
  value: "",
  label: "Saisie",
  start: 0,
  end: 0,
  maxLength: -1,
  multiline: false,
});
function openKeyboard(target: HTMLInputElement | HTMLTextAreaElement) {
  if (target.disabled || target.readOnly) return;
  cancelHold();
  editingControl.value = null;
  keyboardEntry.value = {
    value: target.value,
    label:
      target.getAttribute("aria-label") ??
      target.labels?.[0]?.textContent?.trim() ??
      "Saisie",
    start: target.selectionStart ?? target.value.length,
    end: target.selectionEnd ?? target.value.length,
    maxLength: target.maxLength,
    multiline: target instanceof HTMLTextAreaElement,
  };
  keyboardTarget.value = target;
}
async function closeKeyboard(value?: string, cursor?: number) {
  const target = keyboardTarget.value;
  if (!target) return;
  if (value !== undefined) {
    target.value = value;
    target.dispatchEvent(new Event("input", { bubbles: true }));
    target.dispatchEvent(new Event("change", { bubbles: true }));
  }
  keyboardTarget.value = null;
  await nextTick();
  focusElement(target);
  editingControl.value = target;
  if (cursor !== undefined) target.setSelectionRange(cursor, cursor);
}
function keyboardFor(selector: string) {
  const target = (panelRoot.value ?? launcherRoot.value)?.querySelector(selector);
  if (isTextControl(target ?? null)) openKeyboard(target as HTMLInputElement);
}
const panelHistory: { panel: Panel; focus: FocusBookmark }[] = [];
const clock = ref(new Date()),
  controller = ref<string | null>(null),
  sessions = ref<Session[]>([]),
  toast = ref(""),
  working = ref("");
const checkingUpdates = computed(() => working.value === "Recherche de mises à jour");
const panelRoot = ref<HTMLElement>(),
  cardsRoot = ref<HTMLElement>(),
  width = ref(window.innerWidth),
  height = ref(window.innerHeight);
const settingsTab = ref("display"),
  monitorList = ref<Monitor[]>([]),
  found = ref<AppEntry[]>([]),
  query = ref(""),
  showSystemTools = ref(false),
  scanned = ref(false),
  scanBusy = ref(false),
  scanError = ref(""),
  chosen = ref(new Set<string>());
const settingsSection = computed(() => ['controls', 'remote'].includes(settingsTab.value) ? 'devices' : ['updates', 'diagnostic'].includes(settingsTab.value) ? 'help' : settingsTab.value);
const settingsSections = {
  display: { label: 'Affichage et ambiance', icon: 'ambiance', page: 'display' },
  apps: { label: 'Applications', icon: 'grid', page: 'apps' },
  devices: { label: 'Manettes et télécommandes', icon: 'controller', page: 'controls' },
  system: { label: 'Démarrage et système', icon: 'monitor', page: 'system' },
  help: { label: 'Aide et mises à jour', icon: 'info', page: 'updates' },
};
const settingsSaveStatus = ref('');
const libraryQuery = ref('');
const libraryFilter = ref<LibraryFilter>('all');
const libraryFilters = { all: 'Tout', favorites: 'Favoris', ...categories };
const libraryFiltered = computed(() => !!libraryQuery.value.trim() || libraryFilter.value !== 'all');
const filterCounts = computed(() => Object.fromEntries(Object.keys(libraryFilters).map(key => [key,
  libraryApps(config.value.apps, config.value.settings.library, libraryQuery.value, key as LibraryFilter).length + Number(showYouTubeSuggestion(config.value.apps, libraryQuery.value, key as LibraryFilter)),
])));
const removedApp = ref<RemovedApp | null>(null);
const restoreBusy = ref(false), restoreError = ref('');
const editingCategory = ref<AppCategory | 'auto'>('auto');
const showControllerTest = ref(false);
const controllerHelp = ref(false);
const favorite = (id: string) => config.value.settings.library.favorites.includes(id);
async function toggleFavorite(id: string) {
  const list = config.value.settings.library.favorites;
  config.value.settings.library.favorites = list.includes(id) ? list.filter(value => value !== id) : [...list, id];
  if (await persist()) notify(favorite(id) ? 'Ajouté aux favoris de l’accueil.' : 'Retiré des favoris.');
}
function resetLibrary() {
  const wasEmpty = !!document.activeElement?.closest('.library-empty, .reset-filters');
  libraryQuery.value = ''; libraryFilter.value = 'all';
  if (wasEmpty) void nextTick(() => focusElement(launcherRoot.value?.querySelector<HTMLElement>('.library-tools input') ?? undefined));
}
async function clearLibraryQuery() {
  libraryQuery.value = '';
  await nextTick();
  focusElement(launcherRoot.value?.querySelector<HTMLElement>('.library-tools input') ?? undefined);
}
function showLibrary() { resetLibrary(); view.value = 'grid'; void focusCard(); }
async function openAdd(search = '') {
  query.value = search;
  await openPanel('add');
  if (native.value && !scanned.value) void scan();
}
const controllerTesting = ref(false);
const controllerSnapshot = ref<ControllerSnapshot | null>(null);
async function toggleControllerTest() {
  await run("Test manette", async () => {
    const enabled = !controllerTesting.value;
    controllerTesting.value = enabled;
    controllerSnapshot.value = null;
    try {
      await api.setControllerTest(enabled);
    } catch (error) {
      endControllerTest();
      throw error;
    }
  });
}
function endControllerTest() {
  controllerTesting.value = false;
  controllerSnapshot.value = null;
}
function leaveControllerTest() {
  if (!controllerTesting.value) return;
  endControllerTest();
  void api.setControllerTest(false).catch(notify);
}
async function setDeadzone(value: number) {
  config.value.settings.deadzone = value;
  await persist();
}
const editing = ref<AppEntry | null>(null),
  argumentsText = ref(""),
  update = ref<UpdateInfo | null>(null),
  updateError = ref("");
const confirmTitle = ref(""),
  confirmText = ref(""),
  confirmLabel = ref("Confirmer");
let confirmAction: () => Promise<unknown> = async () => {};
let toastTimer: ReturnType<typeof setTimeout>,
  clockTimer: ReturnType<typeof setInterval>,
  updateTimer: ReturnType<typeof setTimeout>;
let stopNative = () => {};
let resizeObserver: ResizeObserver;
let saveRequest = 0;
let saveChain: Promise<boolean> = Promise.resolve(true);
let lastSaved = defaults();
let audioContext: AudioContext | undefined;
const examples: Tile[] = [
  {
    id: "suggest-netflix",
    name: "Netflix",
    theme: "netflix",
    suggestion: true,
  },
  {
    id: "suggest-youtube",
    name: "YouTube",
    theme: "youtube",
    suggestion: true,
  },
  {
    id: "suggest-spotify",
    name: "Spotify",
    theme: "spotify",
    suggestion: true,
  },
  {
    id: "suggest-internet",
    name: "Internet",
    theme: "internet",
    suggestion: true,
  },
  { id: "suggest-steam", name: "Steam", theme: "steam", suggestion: true },
  { id: "suggest-plezy", name: "Plezy", theme: "plezy", suggestion: true },
  { id: "suggest-silo", name: "Silo", theme: "silo", suggestion: true },
];
const visibleApps = computed(() => {
  if (view.value !== 'carousel') return libraryApps(config.value.apps, config.value.settings.library, libraryQuery.value, libraryFilter.value);
  const apps = homeApps(config.value.apps, config.value.settings.library, sessions.value);
  const youtube = config.value.apps.find(isVacuumTube);
  return youtube && !apps.includes(youtube) ? [...apps, youtube] : apps;
});
const hasHomeSelection = computed(() => config.value.apps.some(app => favorite(app.id) || sessions.value.some(session => session.appId === app.id)));
const tiles = computed<Tile[]>(() => config.value.apps.length
  ? [...visibleApps.value.map(entry => ({ id: entry.id, name: entry.name, theme: entry.theme, entry })),
     ...(showYouTubeSuggestion(config.value.apps, view.value === 'carousel' ? '' : libraryQuery.value, view.value === 'carousel' ? 'all' : libraryFilter.value) ? [{id:'catalog-youtube',name:'YouTube',theme:'youtube' as const,catalog:true,suggestion:true}] : []),
     ...(view.value === 'carousel' ? [{ id: 'library', name: 'Toutes les applications', theme: 'home' as const, special: 'library' }] : [])]
  : [{ id: 'add', name: 'Ajouter des applications', theme: 'home', special: 'add' }, ...examples.map(tile => tile.id === 'suggest-youtube' ? {...tile,id:'catalog-youtube',catalog:true} : tile)]);
const current = computed<Tile>(() => tiles.value[Math.max(0, Math.min(selected.value, tiles.value.length - 1))]
  ?? { id: 'empty', name: 'Aucun résultat', theme: 'home', special: 'empty' });
const empty = computed(() => config.value.apps.length === 0);
const columns = computed(() =>
  Math.max(
    2,
    Math.floor((width.value - 100) / (280 * config.value.settings.scale)),
  ),
);
const selectedSession = computed(() =>
  sessions.value.find((s) => s.appId === current.value.id),
);
const inputLabels = computed(() => controllerLabels(controller.value));
const time = computed(() =>
  clock.value.toLocaleTimeString("fr-CH", {
    hour: "2-digit",
    minute: "2-digit",
  }),
);
const date = computed(() =>
  clock.value.toLocaleDateString("fr-CH", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }),
);
const filtered = computed(() =>
  found.value.filter(
    (a) =>
      (showSystemTools.value || !isSystemTool(a)) &&
      a.name.toLocaleLowerCase().includes(query.value.toLocaleLowerCase()),
  ),
);
const addedTargets = computed(() =>
  new Set(config.value.apps.map((a) => targetKey(a.target))),
);
const isAlreadyAdded = (app: AppEntry) =>
  addedTargets.value.has(targetKey(app.target));
const selectedImports = computed(() =>
  found.value.filter((a) => chosen.value.has(a.id) && !isAlreadyAdded(a)),
);
watch(showSystemTools, (show) => {
  if (!show)
    chosen.value = new Set(
      found.value
        .filter((a) => chosen.value.has(a.id) && !isSystemTool(a))
        .map((a) => a.id),
    );
});
const heroTitle = computed(() =>
  current.value.special === "add"
    ? "Ajouter des applications"
    : current.value.special === "library"
      ? "Toute votre bibliothèque"
    : current.value.special === "windows"
      ? "Retour au bureau."
      : current.value.name,
);
const subtitle = computed(() =>
  current.value.catalog ? 'YouTube sur votre TV, adapté à la manette.' : current.value.special === "windows"
    ? "Canapey reste ouvert en arrière-plan."
    : current.value.special === 'library' ? 'Retrouvez, filtrez et organisez toutes vos applications.'
    : !config.value.apps.length ? 'Choisissez les applications à retrouver sur votre TV.'
    : !hasHomeSelection.value ? 'Ajoutez vos applications préférées aux favoris depuis leurs actions.'
    : selectedSession.value ? 'Votre application est toujours ouverte.' : 'Vos favoris, prêts à ouvrir.',
);
const heroStatus = computed(() =>
  current.value.catalog ? (youtubeDetected.value ? 'PRÊT À OUVRIR' : 'À INSTALLER') : current.value.suggestion
    ? "À AJOUTER"
    : selectedSession.value
      ? { running: 'EN COURS', starting: 'DÉMARRAGE…', closing: 'FERMETURE…', untracked: 'SUIVI LIMITÉ' }[selectedSession.value.status]
      : current.value.entry?.target.kind === 'uri' ? 'RACCOURCI WEB' : '',
);
const startupPainted = ref(false);
const animateBackground = ref(false);
const animateHero = ref(false);
watch(view, () => {
  animateHero.value = true;
});
const heroBg = ref("/art/home.webp"),
  oldBg = ref("");
let imageTicket = 0;
let bgTimer: ReturnType<typeof setTimeout>;
const holdingCard = ref(false);
const quickId = ref<string | null>(null);
const quickAnchor = ref({ left: 16, top: 16 });
const quickSize = ref({ width: 360, height: 540, zoom: 1 });
const quickPosition = computed(() => {
  const top = Math.max(
    16,
    Math.min(quickAnchor.value.top - 24, height.value - quickSize.value.height - 16),
  );
  return {
    left: `${Math.max(16, Math.min(quickAnchor.value.left, width.value - quickSize.value.width - 16)) / quickSize.value.zoom}px`,
    top: `${top / quickSize.value.zoom}px`,
    maxHeight: `${Math.max(0, height.value - 32) / quickSize.value.zoom}px`,
  };
});
const quickObserver = new ResizeObserver(() => {
  const element = panelRoot.value;
  if (!element || !['quick', 'move'].includes(panel.value)) return;
  const zoom = Number.parseFloat(getComputedStyle(element).zoom) || 1;
  quickSize.value = { width: element.offsetWidth * zoom, height: element.offsetHeight * zoom, zoom };
});
watch(() => [panel.value, width.value, height.value], async () => {
  quickObserver.disconnect();
  await nextTick();
  if (panelRoot.value && ['quick', 'move'].includes(panel.value)) quickObserver.observe(panelRoot.value);
});
const quickApp = computed(() =>
  config.value.apps.find((a) => a.id === quickId.value),
);
const quickSession = computed(() =>
  sessions.value.find((s) => s.appId === quickId.value),
);
const quickIndex = computed(() =>
  config.value.apps.findIndex((a) => a.id === quickId.value),
);
const cardHold = new CardHold((holding) => (holdingCard.value = holding));
const cancelHold = () => cardHold.cancel();
function beginAccept(source: string) {
  if (keyboardTarget.value) {
    screenKeyboard.value?.handle("accept");
    return;
  }
  if (source === "controller" && isTextControl(document.activeElement)) {
    openKeyboard(document.activeElement);
    return;
  }
  document.documentElement.dataset.inputMode = "directional";
  if (
    !panel.value &&
    !working.value &&
    current.value.entry &&
    cardsRoot.value?.contains(document.activeElement)
  ) {
    const id = current.value.id;
    cardHold.start(source, () => {
      if (current.value.id === id) void openQuick(selected.value);
    });
  } else dispatch("accept");
}
function releaseAccept(source: string) {
  if (cardHold.release(source)) dispatch("accept");
}
function keyboardUp(e: KeyboardEvent) {
  if (remoteCapturing.value) return;
  if (remoteAcceptCode === e.code) { remoteAcceptCode = null; releaseAccept("remote"); return; }
  if (remoteBindingFor(e) && !(panel.value === 'settings' && settingsTab.value === 'remote')) return;
  if (e.key === "Enter") releaseAccept("keyboard");
}
function visibilityChanged() {
  if (document.hidden) cancelHold();
}
async function openQuick(index: number) {
  if (panel.value || working.value || !tiles.value[index]?.entry) return;
  cancelHold();
  select(index);
  quickId.value = current.value.id;
  await focusCard();
  const rect = cardsRoot.value
    ?.querySelector('[aria-pressed="true"]')
    ?.getBoundingClientRect();
  quickAnchor.value = { left: rect?.left ?? 16, top: rect?.top ?? 32 };
  await openPanel("quick");
}
function removeQuick() {
  if (!quickApp.value) return;
  editing.value = JSON.parse(JSON.stringify(quickApp.value));
  confirm(
    "Retirer cette carte ?",
    "L’application restera installée sur votre PC.",
    "Retirer",
    removeApp,
  );
}
async function moveQuick(delta: number) {
  await moveApp(quickIndex.value, delta);
  await nextTick();
  if (panelRoot.value && document.activeElement?.matches(":disabled"))
    focusElement(
      panelRoot.value.querySelector<HTMLElement>("[data-move-done]") ??
        undefined,
    );
}
function trapFocus(e: KeyboardEvent) {
  const list = focusableItems(panelRoot.value!);
  if (e.shiftKey && document.activeElement === list[0]) {
    e.preventDefault();
    list.at(-1)?.focus();
  } else if (!e.shiftKey && document.activeElement === list.at(-1)) {
    e.preventDefault();
    list[0]?.focus();
  }
}
const sleepPc = () => api.power("sleep"),
  restartPc = () => api.power("restart"),
  shutdownPc = () => api.power("shutdown");
const resumeCurrent = () => api.resume(current.value.id),
  forceCurrent = () => api.closeApp(current.value.id, true);
const resumeSession = (id: string) => run("Reprise", () => api.resume(id));
function closeSession(id: string, dismissMenu = false) {
  const origin = panel.value;
  return run("Fermeture", async () => {
    await api.closeApp(id);
    if (dismissMenu && panel.value === origin &&
        ((origin === "quick" && quickId.value === id) ||
         (origin === "session" && current.value.id === id))) await closePanel();
  });
}
const forceSession = (id: string) =>
  confirm(
    "Forcer la fermeture ?",
    "Les données non enregistrées de cette application peuvent être perdues.",
    "Forcer",
    () => api.closeApp(id, true),
  );
function notify(message: unknown) {
  toast.value = message instanceof Error ? message.message : String(message);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.value = ""), 6500);
}
async function run(label: string, fn: () => Promise<unknown>) {
  if (working.value) return;
  const origin = panel.value;
  const root = panelRoot.value;
  const bookmark = root ? rememberFocus(root) : null;
  working.value = label;
  try {
    await fn();
  } catch (e) {
    notify(e);
  } finally {
    working.value = "";
    await nextTick();
    if (
      panel.value === origin &&
      root &&
      bookmark &&
      !focusableItems(root).includes(document.activeElement as HTMLElement)
    )
      restoreFocus(root, bookmark);
  }
}
function persist() {
  return queueSave();
}
function queueSave(remoteHomeUpdate = false, feedback = panel.value === 'settings') {
  const request = ++saveRequest;
  if (feedback) settingsSaveStatus.value = 'Enregistrement…';
  const snapshot = JSON.parse(JSON.stringify(config.value));
  saveChain = saveChain.then(async () => {
    try {
      await api.save(snapshot, remoteHomeUpdate);
      lastSaved = snapshot;
      if (feedback && request === saveRequest) settingsSaveStatus.value = 'Enregistré';
      return true;
    } catch (e) {
      if (JSON.stringify(config.value) === JSON.stringify(snapshot))
        config.value = JSON.parse(JSON.stringify(lastSaved));
      if (feedback && request === saveRequest) settingsSaveStatus.value = 'Échec de l’enregistrement';
      notify(e);
      return false;
    }
  });
  return saveChain;
}

function selectionChanged() {
  const id = current.value.entry?.id;
  // Utility cards must not erase the last application to restore on startup.
  if (!id || id === config.value.selectedId) return;
  config.value.selectedId = id;
  void queueSave(false, false);
}
function sound() {
  if (!config.value.settings.sound || config.value.settings.soundVolume <= 0) return;
  try {
    audioContext ??= new AudioContext();
    void audioContext.resume();
    const oscillator = audioContext.createOscillator(),
      gain = audioContext.createGain();
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.frequency.setValueAtTime(620, audioContext.currentTime);
    gain.gain.setValueAtTime(0.036 * config.value.settings.soundVolume, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      audioContext.currentTime + 0.035,
    );
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.04);
  } catch {
    /* audio is optional */
  }
}
async function focusCard() {
  await nextTick();
  const card = cardsRoot.value?.querySelector<HTMLElement>(
    '[aria-pressed="true"]',
  );
  card?.focus({ preventScroll: true });
  card?.scrollIntoView({
    block: "nearest",
    inline: "nearest",
    behavior:
      startupPainted.value &&
      config.value.settings.motion &&
      !osReducedMotion.value
        ? "smooth"
        : "instant",
  });
}
function select(index: number) {
  if (index === selected.value) return;
  cancelHold();
  selected.value = index;
  sound();
  selectionChanged();
}
async function openPanel(p: Panel) {
  if (youtubeBusy.value) return;
  cancelHold();
  if (p === panel.value) return;
  const root = panel.value ? panelRoot.value : launcherRoot.value;
  if (root)
    panelHistory.push({ panel: panel.value, focus: rememberFocus(root) });
  editingControl.value = null;
  panel.value = p;
  await nextTick();
  if (panelRoot.value) panelRoot.value.inert = false;
  if (panelRoot.value)
    focusElement(
      p === "confirm"
        ? (panelRoot.value.querySelector<HTMLElement>(
            ".confirm-actions button",
          ) ?? undefined)
        : p === "quick" || p === "move"
          ? (panelRoot.value.querySelector<HTMLElement>(
              ".quick-actions button:not(:disabled)",
            ) ?? undefined)
          : p === "settings"
            ? (panelRoot.value.querySelector<HTMLElement>(
                ".settings-nav button.active",
              ) ?? undefined)
            : p === 'add'
              ? panelRoot.value.querySelector<HTMLElement>('input[type=search]') ?? undefined
              : focusableItems(panelRoot.value)[0],
    );
}
async function closePanel() {
  if (installingUpdate.value || youtubeBusy.value) return;
  const closingQuick = panel.value === "quick" || panel.value === "move";
  editingControl.value = null;
  const previous = panelHistory.pop();
  if (!previous?.panel && panelRoot.value) panelRoot.value.inert = true;
  panel.value = previous?.panel ?? "";
  if (panel.value === "session" && !selectedSession.value) return closePanel();
  if (["quick", "move"].includes(panel.value) && !quickApp.value)
    return closePanel();
  await nextTick();
  const root = panel.value ? panelRoot.value : launcherRoot.value;
  if (!panel.value && closingQuick) await focusCard();
  else if (root && previous) restoreFocus(root, previous.focus);
  else if (!panel.value) await focusCard();
}
function dismissPanels() {
  if (youtubeBusy.value) return;
  keyboardTarget.value = null;
  editingControl.value = null;
  panelHistory.length = 0;
  if (panelRoot.value) panelRoot.value.inert = true;
  panel.value = "";
}
function confirm(
  title: string,
  text: string,
  label: string,
  action: () => Promise<unknown>,
) {
  confirmTitle.value = title;
  confirmText.value = text;
  confirmLabel.value = label;
  confirmAction = action;
  void openPanel("confirm");
}
async function acceptConfirm() {
  await run(confirmLabel.value, async () => {
    await confirmAction();
    await closePanel();
  });
}
async function activate(tile = current.value, youtubeChecked = false) {
  if (!youtubeChecked && (tile.catalog || (tile.entry && isVacuumTube(tile.entry)))) {
    if (youtubeChecking.value) return;
    youtubeChecking.value = true;
    try {
      // Recheck at launch so uninstalling or moving the executable never leaves a dead card.
      if (native.value) {
        try { youtubeDetected.value = await api.detectYouTube(); }
        catch { youtubeDetected.value = null; /* The setup panel exposes detection errors and retry. */ }
        if (youtubeDetected.value) {
          try { await openYouTube(youtubeDetected.value); }
          catch (e) { notify(e); }
          return;
        }
      }
      await openPanel('youtube');
    } finally { youtubeChecking.value = false; }
    return;
  }
  if (tile.special === "add") {
    void openAdd();
    return;
  }
  if (tile.special === "library") { showLibrary(); return; }
  if (tile.special === "empty") return;
  if (tile.special === "windows") {
    await run("Retour Windows", api.desktop);
    return;
  }
  if (tile.suggestion) {
    void openAdd(tile.name);
    return;
  }
  const session = sessions.value.find((s) => s.appId === tile.id);
  if (session) {
    if (session.status === "running") await resumeSession(tile.id);
    else void openPanel("session");
    return;
  }
  await run("Lancement", async () => {
    config.value.selectedId = tile.id;
    if (!(await persist())) return;
    const session = await api.launch(tile.id);
    sessions.value = [
      ...sessions.value.filter((s) => s.appId !== session.appId),
      session,
    ];
  });
}
function dispatch(action: Action) {
  if (remoteCapturing.value && action !== "home") return;
  if (keyboardTarget.value && action !== "home") {
    screenKeyboard.value?.handle(action);
    return;
  }
  if (action === "accept-down") {
    beginAccept("controller");
    return;
  }
  if (action === "accept-up") {
    releaseAccept("controller");
    return;
  }
  if (action === "accept-cancel") {
    cancelHold();
    return;
  }
  if (action === "options") {
    if (cardsRoot.value?.contains(document.activeElement))
      void openQuick(selected.value);
    return;
  }
  cancelHold();
  document.documentElement.dataset.inputMode = "directional";
  if (action === "home") {
    if (youtubeBusy.value) return;
    dismissPanels();
    view.value = "carousel";
    void focusCard();
    return;
  }
  if (working.value) return;
  const element = document.activeElement as HTMLElement;
  if (element.matches('.release-notes') && (action === 'up' || action === 'down')) {
    const scroller = element.closest('.settings-content');
    if (scroller && (action === 'down' ? scroller.scrollTop + scroller.clientHeight < scroller.scrollHeight - 1 : scroller.scrollTop > 0)) {
      scroller.scrollBy({ top: action === 'down' ? 120 : -120, behavior: 'instant' });
      return;
    }
  }
  if (
    panel.value === "audio" &&
    panelRoot.value &&
    (action === "up" || action === "down")
  ) {
    const controls = focusableItems(panelRoot.value);
    const index = controls.indexOf(element);
    focusElement(
      controls[
        Math.max(
          0,
          Math.min(controls.length - 1, index + (action === "up" ? -1 : 1)),
        )
      ],
    );
    return;
  }
  if (panel.value === "audio" && element.matches("[data-audio-volume]")) {
    editingControl.value = null;
    if (action === "left" || action === "right") {
      audio.setVolume(audioVolume.value + (action === "left" ? -2 : 2));
      return;
    }
    if (action === "accept") return;
  }
  if (editingControl.value && editingControl.value !== element)
    editingControl.value = null;
  if (editingControl.value) {
    if (action === "back" || action === "accept") {
      editingControl.value = null;
      return;
    }
    if (["up", "down", "left", "right"].includes(action)) {
      if (element instanceof HTMLInputElement && element.type === "range") {
        ["left", "down"].includes(action)
          ? element.stepDown()
          : element.stepUp();
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
        return;
      }
      if (element instanceof HTMLSelectElement) {
        const delta = ["left", "up"].includes(action) ? -1 : 1;
        element.selectedIndex = Math.max(
          0,
          Math.min(element.options.length - 1, element.selectedIndex + delta),
        );
        element.dispatchEvent(new Event("change", { bubbles: true }));
        return;
      }
      // A controller direction leaves text entry and moves focus. Keyboard caret
      // movement is handled natively while explicitly editing a text field.
      editingControl.value = null;
    }
  }
  if (panel.value) {
    if (action === "back") {
      void closePanel();
      return;
    }
    if (action === "accept") {
      if (!panelRoot.value?.contains(element) || element.matches(":disabled"))
        return;
      if (
        isTextControl(element) ||
        element instanceof HTMLSelectElement ||
        (element instanceof HTMLInputElement && element.type === "range")
      ) {
        editingControl.value = element;
      } else element.click();
      return;
    }
    if (panelRoot.value && ["up", "down", "left", "right"].includes(action)) {
      focusDirection(panelRoot.value, action);
    }
    return;
  }
  if (action === "menu") {
    void openSettings();
    return;
  }
  if (action === "back") {
    view.value = "carousel";
    void focusCard();
    return;
  }
  if (action === 'accept' && (isTextControl(element) || element instanceof HTMLSelectElement)) {
    editingControl.value = element;
    return;
  }
  if (action === "accept") {
    if (
      launcherRoot.value?.contains(element) &&
      element instanceof HTMLButtonElement
    )
      element.click();
    else void activate();
    return;
  }
  if (!cardsRoot.value?.contains(element)) {
    if (element.closest("footer") && action === "up") {
      void focusCard();
    } else if (launcherRoot.value) {
      focusDirection(
        launcherRoot.value,
        action,
        focusableItems(launcherRoot.value).filter(
          (e) =>
            !e.classList.contains("app-card") ||
            e.getAttribute("aria-pressed") === "true",
        ),
      );
    }
    return;
  }
  if (view.value === "carousel" && action === "up") {
    if (launcherRoot.value) focusDirection(launcherRoot.value, action);
    return;
  }
  if (view.value === 'grid' && action === 'up' && selected.value < columns.value) {
    focusElement(launcherRoot.value?.querySelector<HTMLElement>('.library-tools input') ?? undefined);
    return;
  }
  const next = navigate(
    selected.value,
    tiles.value.length,
    columns.value,
    view.value,
    action,
  );
  select(next.index);
  view.value = next.view;
  void focusCard();
}
function keyboard(e: KeyboardEvent) {
  if (remoteCapturing.value) return;
  if (keyboardTarget.value) return;
  if (controllerTesting.value) {
    if (e.key === "Escape") {
      e.preventDefault();
      leaveControllerTest();
    }
    // Tab and pointer input retain an accessible way to stop the test.
    if (e.key !== "Tab" && e.key !== "Enter" && e.key !== " ")
      e.preventDefault();
    return;
  }
  if (e.isComposing || e.defaultPrevented) return;
  // Do not remap text editing, select editing, or the configuration interface itself.
  const remoteTarget = e.target as HTMLElement;
  if (!(panel.value === 'settings' && settingsTab.value === 'remote')
      && !isTextControl(remoteTarget) && remoteTarget.tagName !== 'SELECT'
      && editingControl.value !== remoteTarget) {
    const binding = remoteBindingFor(e);
    if (binding && (!binding.global || !native.value)) {
      e.preventDefault();
      if (e.repeat && !['up','down','left','right','volumeUp','volumeDown'].includes(binding.action)) return;
      if (binding.action === 'accept') { remoteAcceptCode = e.code; beginAccept('remote'); }
      else executeRemote(binding);
      return;
    }
  }
  if (e.ctrlKey && e.shiftKey && e.code === "KeyQ") {
    e.preventDefault();
    if (working.value || panel.value === "confirm" || e.repeat) return;
    confirm(
      "Quitter Canapey ?",
      "Vos applications resteront ouvertes.",
      "Quitter",
      api.quit,
    );
    return;
  }
  if (e.altKey || e.metaKey || e.ctrlKey) return;
  const target = e.target as HTMLElement;
  if (e.key === "Tab") {
    editingControl.value = null;
    return;
  }
  const text = isTextControl(target);
  if (text && editingControl.value === target) {
    // Backspace deletes text here; it never navigates back while typing.
    if (e.key !== "Escape" && e.key !== "Enter" && e.key !== "F1") return;
    if (
      e.key === "Enter" &&
      e.shiftKey &&
      target instanceof HTMLTextAreaElement
    )
      return;
  } else if (text && e.key.length === 1) {
    editingControl.value = target;
    return;
  }
  const keys: Record<string, Action> = {
    ArrowLeft: "left",
    ArrowRight: "right",
    ArrowUp: "up",
    ArrowDown: "down",
    Enter: "accept",
    Escape: "back",
    Backspace: "back",
    F1: "menu",
  };
  if (keys[e.key]) {
    e.preventDefault();
    if (e.repeat && ["Enter", "Escape", "Backspace", "F1"].includes(e.key))
      return;
    if (e.key === "Enter") beginAccept("keyboard");
    else dispatch(keys[e.key]);
  }
}
function pointerInput(e: PointerEvent) {
  document.documentElement.dataset.inputMode = "pointer";
  editingControl.value = isTextControl(e.target as Element)
    ? (e.target as HTMLElement)
    : null;
}
function focusChanged() {
  cardsFocused.value = !!cardsRoot.value?.contains(document.activeElement);
  if (!cardsFocused.value) cancelHold();
  if (editingControl.value !== document.activeElement)
    editingControl.value = null;
}
async function openSettings() {
  void openPanel("settings");
  try {
    monitorList.value = await api.monitors();
  } catch (e) {
    notify(e);
  }
}
async function scan() {
  if (scanBusy.value) return;
  const root = panelRoot.value;
  const bookmark = root ? rememberFocus(root) : null;
  scanBusy.value = true;
  scanError.value = "";
  try {
    found.value = await api.scan();
    scanned.value = true;
    chosen.value = new Set();
  } catch (e) {
    scanError.value = String(e instanceof Error ? e.message : e);
  } finally {
    scanBusy.value = false;
    await nextTick();
    if (
      panel.value === "add" &&
      root &&
      bookmark &&
      !focusableItems(root).includes(document.activeElement as HTMLElement)
    )
      restoreFocus(root, bookmark);
  }
}
function toggleChoice(id: string) {
  const app = found.value.find((a) => a.id === id);
  if (!app || isAlreadyAdded(app)) return;
  const set = new Set(chosen.value);
  set.has(id) ? set.delete(id) : set.add(id);
  chosen.value = set;
}
async function addEntries(entries: AppEntry[]) {
  const keys = new Set(config.value.apps.map((a) => targetKey(a.target)));
  const fresh = entries.filter((a) => !keys.has(targetKey(a.target)));
  config.value.apps.push(...fresh);
  resetLibrary();
  view.value = "grid";
  if (fresh[0]) config.value.selectedId = fresh[0].id;
  if (!(await persist())) return;
  await nextTick();
  selected.value = reconcileSelection(tiles.value.map(tile => tile.id), fresh[0]?.id ?? null);
  dismissPanels();
  await focusCard();
  notify(
    fresh.length
      ? `${fresh.length} application${fresh.length > 1 ? "s ajoutées" : " ajoutée"}.`
      : "Déjà dans votre bibliothèque.",
  );
}
async function manual() {
  await run("Choix de l’application", async () => {
    const app = await api.pickTarget();
    if (app) {
      editing.value = app;
      editingCategory.value = "auto";
      argumentsText.value = app.target.args.join("\n");
      void openPanel("edit");
    }
  });
}
function edit(app: AppEntry) {
  editingCategory.value = config.value.settings.library.categories[app.id] ?? "auto";
  editing.value = JSON.parse(JSON.stringify(app));
  argumentsText.value = app.target.args.join("\n");
  void openPanel("edit");
}
async function saveEditing() {
  const app = editing.value;
  if (!app) return;
  app.name = app.name.trim();
  if (!app.name) {
    notify("Indiquez un nom.");
    return;
  }
  app.target.args = argumentsText.value ? argumentsText.value.split("\n") : [];
  if (editingCategory.value === 'auto') delete config.value.settings.library.categories[app.id];
  else config.value.settings.library.categories[app.id] = editingCategory.value;
  const index = config.value.apps.findIndex((a) => a.id === app.id);
  if (index >= 0) {
    config.value.apps[index] = app;
    if (await persist()) await closePanel();
  } else await addEntries([app]);
}
async function moveApp(index: number, delta: number) {
  const to = index + delta;
  if (index < 0 || to < 0 || to >= config.value.apps.length) return;
  const focused = document.activeElement as HTMLElement;
  const changingSort = config.value.settings.library.sort !== 'custom';
  const [item] = config.value.apps.splice(index, 1);
  config.value.apps.splice(to, 0, item!);
  config.value.settings.library.sort = 'custom';
  if (!(await persist())) return;
  if (changingSort) notify('Ordre personnalisé activé.');
  await nextTick();
  if (focused.matches(":disabled") && panelRoot.value) {
    focusElement(
      focusableItems(panelRoot.value).find(
        (e) => e.dataset.focusKey === `${item!.id}:name`,
      ),
    );
  }
}
async function removeApp() {
  if (!editing.value) return;
  const result = removeLibraryApp(config.value, editing.value.id);
  if (!result) return;
  config.value = result.config;
  if (!(await persist()))
    throw new Error("La suppression n’a pas été enregistrée.");
  removedApp.value = result.removed;
  restoreError.value = '';
  // Skip the removed editor when returning from its confirmation.
  panelHistory.pop();
}
async function focusAfterRemovalNotice() {
  await nextTick();
  if (panel.value === 'settings') {
    focusElement(panelRoot.value?.querySelector<HTMLElement>('.manage-name, .content-heading button') ?? undefined);
  } else await focusCard();
}
async function dismissRemoval() {
  removedApp.value = null;
  restoreError.value = '';
  await focusAfterRemovalNotice();
}
async function restoreRemovedApp() {
  if (!removedApp.value || restoreBusy.value) return;
  restoreBusy.value = true;
  restoreError.value = '';
  try {
    const id = removedApp.value.app.id;
    config.value = restoreLibraryApp(config.value, removedApp.value);
    if (!(await persist())) throw new Error('Restauration non enregistrée. Réessayez.');
    removedApp.value = null;
    if (!panel.value) { resetLibrary(); view.value = 'grid'; }
    await nextTick();
    selected.value = reconcileSelection(tiles.value.map(tile => tile.id), id);
    await focusAfterRemovalNotice();
    notify('Carte restaurée avec ses favoris et sa catégorie.');
  } catch (error) {
    restoreError.value = error instanceof Error ? error.message : String(error);
  } finally { restoreBusy.value = false; }
}
async function imagePick(kind: "card" | "background") {
  await run("Choix du visuel", async () => {
    const path = await api.pickImage(kind);
    if (path && editing.value) editing.value[kind] = path;
  });
}
async function checkUpdates() {
  if (working.value) return;
  update.value = null;
  updateError.value = "";
  await run("Recherche de mises à jour", async () => {
    try {
      update.value = await api.checkUpdate();
    } catch (e) {
      updateError.value = e instanceof Error ? e.message : String(e);
    }
  });
}
function requestUpdateInstall() {
  const names = appsToClose.value.map(session => session.name);
  confirm(
    'Installer la mise à jour ?',
    names.length
      ? `Canapey demandera la fermeture normale de ${names.join(', ')}, puis installera la mise à jour et redémarrera. Confirmez toute demande d’enregistrement dans ces applications.`
      : 'Canapey va installer la mise à jour et redémarrer. Vos paramètres et vos visuels seront conservés.',
    names.length ? 'Fermer les applications et installer' : 'Télécharger et installer',
    async () => {
      installingUpdate.value = true;
      updateError.value = '';
      updateStatus.value = names.length ? 'Fermeture des applications…' : 'Préparation de la mise à jour…';
      try { await api.installUpdate(); }
      catch (error) { updateError.value = error instanceof Error ? error.message : String(error); throw error; }
      finally { installingUpdate.value = false; updateStatus.value = ''; }
    },
  );
}
function tileImage(t: Tile) {
  if (t.special) return "";
  return api.imageUrl(t.entry?.card) || `/art/${t.theme}-card.webp`;
}
function selectGeneralAmbiance(id: typeof generalAmbiances[number]['id']) {
  config.value.settings.generalAmbiance = id;
  config.value.settings.dynamicBackground = false;
  void persist();
}
watch(
  () => backgroundCandidates(current.value.theme, api.imageUrl(current.value.entry?.background), config.value.settings),
  async (targets) => {
    const ticket = ++imageTicket;
    const animate = startupPainted.value;
    for (const target of targets) {
      if (ticket !== imageTicket || target === heroBg.value) return;
      const image = new Image();
      image.src = target;
      try { await image.decode(); } catch { continue; }
      if (ticket !== imageTicket) return;
      animateBackground.value = animate;
      oldBg.value = animate ? heroBg.value : "";
      heroBg.value = target;
      clearTimeout(bgTimer);
      bgTimer = setTimeout(() => (oldBg.value = ""), 650);
      return;
    }
  },
);
watch(
  () => current.value.id,
  () => {
    const next = tiles.value[selected.value + 1];
    if (next && !next.special) {
      const img = new Image();
      img.src = tileImage(next);
    }
  },
);
watch(panel, async (value) => {
  document.body.classList.toggle("panel-open", !!value);
});
watch([panel, settingsTab, showControllerTest], () => {
  if (panel.value !== "settings" || settingsTab.value !== "controls" || !showControllerTest.value)
    leaveControllerTest();
});
watch(selectedSession, (session) => {
  if (!session && panel.value === "session") {
    void closePanel();
  }
});
watch(audioState, async () => {
  if (panel.value !== "audio" || !panelRoot.value) return;
  const focused = document.activeElement as HTMLElement;
  const bookmark = rememberFocus(panelRoot.value);
  await nextTick();
  if (
    panel.value === "audio" &&
    panelRoot.value &&
    (!focused.isConnected || focused.matches(":disabled"))
  ) {
    restoreFocus(panelRoot.value, bookmark);
  }
});
watch(
  () => config.value.settings.scale,
  () => {
    if (!panel.value) void focusCard();
  },
);
watch(settingsTab, async () => {
  const restoreSubnav = !!document.activeElement?.closest('.settings-subnav');
  if (!loaded.value) return;
  config.value.settings.lastSettingsTab = settingsTab.value;
  settingsSaveStatus.value = '';
  void queueSave(false, false);
  if (restoreSubnav) {
    await nextTick();
    focusElement(panelRoot.value?.querySelector<HTMLElement>('.settings-subnav button[aria-pressed="true"]') ?? undefined);
  }
});
watch(() => tiles.value.map(tile => tile.id), (ids, previous) => {
  const id = previous?.[selected.value];
  selected.value = reconcileSelection(ids, id ?? config.value.selectedId);
  if (!panel.value && cardsFocused.value) void focusCard();
}, { flush: 'pre' });
onMounted(async () => {
  document.addEventListener("keydown", keyboard);
  document.addEventListener("keyup", keyboardUp);
  window.addEventListener("blur", cancelHold);
  document.addEventListener("visibilitychange", visibilityChanged);
  document.addEventListener("pointerdown", pointerInput);
  document.addEventListener("focusin", focusChanged);
  resizeObserver = new ResizeObserver(() => {
    width.value = window.innerWidth;
    height.value = window.innerHeight;
    if (!panel.value) void focusCard();
  });
  resizeObserver.observe(document.documentElement);
  clockTimer = setInterval(() => {
    if (!document.hidden) clock.value = new Date();
  }, 1000);
  try {
    startupMark("bootstrapStart");
    const b = await api.boot();
    startupMark("bootstrapEnd");
    config.value = b.config;
    settingsTab.value = ['display', 'apps', 'controls', 'remote', 'system', 'updates', 'diagnostic'].includes(b.config.settings.lastSettingsTab) ? b.config.settings.lastSettingsTab : 'display';
    lastSaved = JSON.parse(JSON.stringify(b.config));
    version.value = b.version;
    native.value = b.native;
    if (b.native) void api.detectYouTube().then(app => { youtubeDetected.value = app; }).catch(() => {});
    controller.value = b.controller;
    sessions.value = b.sessions;
    selected.value = reconcileSelection(
      tiles.value.map((t) => t.id),
      b.config.selectedId,
    );
    if (b.warning) notify(b.warning);
    startupMark("subscribeStart");
    stopNative = await api.subscribe({
      appleInput,
      action: (action) => {
        if (!controllerTesting.value) dispatch(action);
      },
      controllerSnapshot: (snapshot) => {
        if (controllerTesting.value) controllerSnapshot.value = snapshot;
      },
      controllerTestEnded: endControllerTest,
      remoteAction: nativeRemoteAction,
      updateStatus: (message) => { updateStatus.value = message; },
      controller: (v) => {
        cancelHold();
        controller.value = v;
      },
      sessions: async (v) => {
        const root = panel.value === 'settings' && settingsTab.value === 'diagnostic'
          ? panelRoot.value : null;
        const bookmark = root ? rememberFocus(root) : null;
        sessions.value = v;
        await nextTick();
        if (root && bookmark && root === panelRoot.value &&
            panel.value === 'settings' && settingsTab.value === 'diagnostic' &&
            !focusableItems(root).includes(document.activeElement as HTMLElement)) {
          restoreFocus(root, bookmark);
        }
      },
      home: (preservePanel) => {
        if (!preservePanel || !panel.value) dispatch("home");
        clock.value = new Date();
        requestAnimationFrame(() =>
          requestAnimationFrame(() => void api.returnReady()),
        );
      },
      error: notify,
    });
    startupMark("subscribeEnd");
  } catch (e) {
    notify(e);
  } finally {
    loaded.value = true;
    await nextTick();
    await focusCard();
    startupMark("focused");
    try {
      await api.ready();
    } catch (e) {
      notify(e);
    }
    startupPainted.value = true;
    if (native.value) {
      void audio.refresh();
      audioTimer = setInterval(() => {
        if (!document.hidden && document.hasFocus()) void audio.refresh();
      }, 2000);
    }
  }
  updateTimer = setTimeout(async () => {
    if (native.value)
      try {
        update.value = await api.checkUpdate();
        if (update.value.state === "available")
          notify(
            `Canapey ${update.value.version} est disponible dans les paramètres.`,
          );
      } catch {
        /* offline must not disturb home */
      }
  }, 15000);
});
onUnmounted(() => {
  leaveControllerTest();
  cancelHold();
  document.removeEventListener("keydown", keyboard);
  document.removeEventListener("keyup", keyboardUp);
  window.removeEventListener("blur", cancelHold);
  document.removeEventListener("visibilitychange", visibilityChanged);
  document.removeEventListener("pointerdown", pointerInput);
  document.removeEventListener("focusin", focusChanged);
  motionPreference.removeEventListener("change", motionChanged);
  resizeObserver?.disconnect();
  quickObserver.disconnect();
  clearInterval(clockTimer);
  clearInterval(audioTimer);
  clearTimeout(updateTimer);
  clearTimeout(toastTimer);
  clearTimeout(bgTimer);
  stopNative();
});
</script>

<template>
  <main
    ref="launcherRoot"
    :data-editing="!!editingControl"
    :data-card-focus="cardsFocused && !panel"
    class="launcher"
    :class="{
      'reduce-motion': !config.settings.motion || osReducedMotion,
      'grid-mode': view === 'grid',
      ready: loaded,
    }"
    :style="{
      '--ui-scale': config.settings.scale,
      '--columns': columns,
      '--screen-height': height + 'px',
      '--background-brightness': config.settings.backgroundBrightness,
      '--background-blur': config.settings.backgroundBlur + 'px',
    }"
  >
    <div class="backdrop" aria-hidden="true">
      <img v-if="oldBg" :src="oldBg" class="backdrop-old" alt="" /><img
        :key="heroBg"
        :src="heroBg"
        class="backdrop-current"
        :style="{ animation: animateBackground ? undefined : 'none' }"
        alt=""
      />
      <div class="backdrop-scrim" />
    </div>
    <header class="topbar" :inert="!!panel || !!keyboardTarget">
      <div class="brand">
        <img class="brand-mark" src="/brand/canapey-mark.svg" width="31" height="31" alt="" /><span
          >canapey<span class="brand-dot">.</span></span
        >
      </div>
      <nav aria-label="Navigation principale">
        <button
          :class="{ active: view === 'carousel' }"
          @click="
            view = 'carousel';
            focusCard();
          "
        >
          Accueil</button
        ><button
          :class="{ active: view === 'grid' }"
          @click="
            showLibrary();
          "
        >
          Bibliothèque
        </button>
      </nav>
      <div class="top-right">
        <button
          class="icon-button audio-trigger"
          :class="{ 'is-muted': audioState?.muted }"
          :title="`Commandes rapides · ${volumeDescription}`"
          aria-label="Commandes rapides"
          :aria-description="volumeDescription"
          aria-haspopup="dialog"
          :aria-expanded="panel === 'audio'"
          @click="openAudio"
        >
          <Icon
            :name="audioState?.muted ? 'muted' : 'volume'"
            :size="22"
          />
          <span class="header-volume" aria-hidden="true">
            <span>{{ headerVolume ?? '—' }}<small v-if="headerVolume !== null">%</small></span>
            <span class="header-volume-track"><i :style="{ width: `${audioState?.muted ? 0 : (headerVolume ?? 0)}%` }" /></span>
          </span></button
        ><time>{{ time }}</time
        ><button
          class="icon-button"
          aria-label="Paramètres"
          @click="openSettings"
        >
          <Icon name="settings" :size="22" />
        </button>
        <button
          class="icon-button power-button"
          aria-label="Alimentation"
          title="Alimentation"
          aria-haspopup="dialog"
          @click="openPanel('power')"
        >
          <Icon name="power" :size="21" />
        </button>
      </div>
    </header>
    <section
      v-if="view === 'carousel'"
      :inert="!!panel || !!keyboardTarget"
      class="hero"
      :class="{ 'hero-initial': !animateHero }"
      aria-live="polite"
    >
      <div v-if="heroStatus" class="eyebrow">
        <span class="tiny-line" />{{ heroStatus }}
      </div>
      <h1 :key="heroTitle">{{ heroTitle }}</h1>
      <p v-if="subtitle">{{ subtitle }}</p>
      <div class="hero-actions">
        <button class="primary-button" @click="activate()"><Icon :name="current.special === 'add' ? 'plus' : current.special === 'library' ? 'grid' : 'play'" :size="21" />{{ current.catalog ? (youtubeDetected ? 'Ouvrir YouTube' : 'Installer YouTube') : current.special === 'add' ? 'Ajouter mes applications' : current.special === 'library' ? 'Voir la bibliothèque' : selectedSession?.status === 'running' ? 'Reprendre' : current.suggestion ? 'Ajouter' : selectedSession ? 'Voir la session' : 'Ouvrir' }}</button>
        <button v-if="current.entry" class="small-button" @click="openQuick(selected)">Actions</button>
      </div>
    </section>
    <section
      class="library"
      :inert="!!panel || !!keyboardTarget"
      :class="view"
      aria-label="Applications"
    >
      <RemovalNotice v-if="removedApp" class="library-removal" :name="removedApp.app.name" :busy="restoreBusy" :error="restoreError" @restore="restoreRemovedApp" @dismiss="dismissRemoval" />
      <div class="library-heading">
        <div>
          <span class="section-label">{{
            empty
              ? "Applications suggérées"
              : view === "grid"
                ? "Votre bibliothèque"
                : hasHomeSelection ? "En cours et favoris" : "Pour commencer"
          }}</span>
          <span v-if="!empty" class="section-count" role="status">{{
            `${tiles.filter(tile => !tile.special).length} application${tiles.filter(tile => !tile.special).length > 1 ? "s" : ""}${view === 'grid' && libraryFiltered ? ` sur ${config.apps.length + Number(!config.apps.some(isVacuumTube))}` : ''}`
          }}</span>
        </div>
        <button v-if="view === 'grid'" class="small-button" @click="openAdd()"><Icon name="plus" :size="20" />Ajouter</button>
      </div>
      <div v-if="view === 'grid' && !empty" class="library-tools">
        <div class="library-search"><label class="search-field"><Icon name="search" :size="20" /><input v-model="libraryQuery" type="search" aria-label="Rechercher dans la bibliothèque" placeholder="Rechercher une application" /></label><button v-if="libraryQuery" class="small-button" aria-label="Effacer la recherche" @click="clearLibraryQuery"><Icon name="close" :size="20" /></button><button class="small-button" aria-label="Clavier pour la bibliothèque" @click="keyboardFor('.library-tools input')"><Icon name="keyboard" :size="20" /></button></div>
        <label class="library-sort">Trier<select v-model="config.settings.library.sort" @change="persist"><option value="custom">Mon ordre</option><option value="name">Nom A–Z</option><option value="category">Catégorie</option></select></label>
        <div class="library-filters" role="group" aria-label="Filtrer la bibliothèque"><button v-for="(label, key) in libraryFilters" :key="key" :aria-label="label" :aria-description="`${filterCounts[key]} application${filterCounts[key] === 1 ? '' : 's'}`" :aria-pressed="libraryFilter === key" @click="libraryFilter = key">{{ label }} <span aria-hidden="true">{{ filterCounts[key] }}</span></button><button v-if="libraryFiltered && tiles.length" class="reset-filters" @click="resetLibrary">Effacer les filtres</button></div>
      </div>
      <div v-if="view === 'grid' && !empty && !tiles.length" class="library-empty"><h2>Aucune application trouvée</h2><p>{{ libraryFilter === 'favorites' && !config.settings.library.favorites.length ? 'Ajoutez vos favoris depuis le menu Actions d’une carte.' : libraryQuery.trim() ? `Aucun résultat pour « ${libraryQuery.trim()} »${libraryFilter === 'all' ? '' : ` dans ${libraryFilters[libraryFilter]}`}.` : `Aucune application dans ${libraryFilters[libraryFilter]}. Modifiez la catégorie d’une carte depuis ses actions.` }}</p><button class="small-button" @click="resetLibrary">Effacer les filtres</button></div>
      <div
        ref="cardsRoot"
        class="cards"
        :class="view"
        role="group"
        aria-label="Choisir une application"
      >
        <AppCard
          v-for="(tile, i) in tiles"
          :key="tile.id"
          :data-focus-key="`app:${tile.id}`"
          :name="tile.name"
          :theme="tile.theme"
          :special="tile.special"
          :web="tile.entry?.target.kind === 'uri'"
          :suggestion="tile.suggestion"
          :suggestion-label="tile.catalog ? (youtubeDetected ? 'Disponible' : 'À installer') : undefined"
          :image="tileImage(tile)"
          :eager="i < (view === 'grid' ? columns * 3 : 6)"
          :icon="api.imageUrl(tile.entry?.icon)"
          :selected="selected === i"
          :holding="selected === i && holdingCard"
          :has-options="!!tile.entry"
          @options="openQuick(i)"
          :favorite="favorite(tile.id)"
          :running="sessions.some((s) => s.appId === tile.id)"
          @select="select(i)"
          @activate="
            select(i);
            activate(tile);
          "
        />
      </div>
    </section>
    <footer class="bottom-bar" :inert="!!panel || !!keyboardTarget">
      <div class="hints" :data-controller-family="inputLabels.family">
        <span class="controller-status" role="img" :aria-label="inputLabels.device" :title="controller ?? 'Navigation au clavier'">
          <Icon :name="controller ? 'controller' : 'keyboard'" :size="22" /><i v-if="controller" />
        </span>
        <span
          ><kbd :class="{ 'pad-key': controller }">{{ inputLabels.accept }}</kbd
          >OK</span
        ><span
          ><kbd :class="{ 'pad-key': controller }">{{ inputLabels.back }}</kbd
          >Retour</span
        ><span
          ><kbd>{{ inputLabels.menu }}</kbd
          >Paramètres</span
        >
      </div>
      <span v-if="current.entry" class="quick-hint"
        >Maintenir {{ inputLabels.acceptName }} ·
        Actions</span
      >
      <span v-if="!native" class="preview-badge"
        >Aperçu interface · fonctions Windows indisponibles</span
      ><span v-else class="footer-date">{{ date }}</span>
    </footer>
    <div v-if="working && !checkingUpdates" class="busy-pill" role="status">
      <span class="spinner" />{{ working }}
    </div>
    <Transition name="toast"
      ><div v-if="toast" :inert="!!panel || !!keyboardTarget" class="toast-message" role="status">
        <Icon name="info" :size="20" /><span>{{ toast }}</span
        ><button
          class="icon-button"
          aria-label="Fermer le message"
          @click="toast = ''"
        >
          <Icon name="close" :size="18" />
        </button></div
    ></Transition>
    <Transition name="panel">
      <div
        v-if="panel"
        :inert="!!keyboardTarget"
        class="overlay"
        :class="{
          'quick-overlay': panel === 'quick' || panel === 'move',
          'audio-overlay': panel === 'audio',
        }"
        @click.self="closePanel"
      >
        <section
          ref="panelRoot"
          class="panel"
          :class="{
            compact: ['power', 'confirm', 'session'].includes(panel),
            'audio-panel': panel === 'audio',
            'settings-panel': panel === 'settings',
            'controller-test-active': controllerTesting,
            'quick-panel': panel === 'quick' || panel === 'move',
          }"
          :style="
            panel === 'quick' || panel === 'move' ? quickPosition : undefined
          "
          role="dialog"
          aria-modal="true"
          :aria-label="
            panel === 'youtube' ? 'YouTube' : panel === 'audio'
              ? 'Commandes rapides'
              : panel === 'quick'
                ? `Actions pour ${quickApp?.name}`
                : panel === 'move'
                  ? 'Déplacer la carte'
                  : panel === 'settings'
                    ? 'Paramètres'
                    : panel === 'add'
                      ? 'Ajouter des applications'
                      : panel === 'edit'
                        ? 'Personnaliser une application'
                        : panel === 'power'
                          ? 'Alimentation'
                          : panel === 'session'
                            ? 'Application en cours'
                            : confirmTitle
          "
          @keydown.tab="trapFocus"
        >
          <div class="panel-heading">
            <div class="panel-identity">
              <img v-if="(panel === 'quick' || panel === 'move') && quickApp"
                class="quick-app-art" :src="api.imageUrl(quickApp.card) || `/art/${quickApp.theme}-card.webp`" alt="" />
              <span v-else-if="panel === 'settings'" class="settings-emblem"><Icon name="settings" :size="25" /></span>
              <div class="panel-title">
              <span class="eyebrow">{{ panel === 'quick' || panel === 'move' ? 'APPLICATION' : 'CANAPEY' }}</span>
              <h2>
                {{
                  panel === 'youtube' ? 'YouTube' : panel === "audio"
                    ? "Commandes rapides"
                    : panel === "quick"
                      ? quickApp?.name
                      : panel === "move"
                        ? "Déplacer la carte"
                        : panel === "settings"
                          ? "Paramètres"
                          : panel === "add"
                            ? "Ajouter des applications"
                            : panel === "edit"
                              ? "Personnaliser"
                              : panel === "power"
                                ? "Alimentation"
                                : panel === "session"
                                  ? current.name
                                  : confirmTitle
                }}
              </h2>
              <span v-if="panel === 'quick' && quickSession" class="quick-session-status">
                <i />{{ { starting: 'Démarrage…', running: 'En cours', closing: 'Fermeture…', untracked: 'Suivi limité' }[quickSession.status] }}
              </span>
              </div>
            </div>
            <button class="icon-button" aria-label="Fermer" :disabled="installingUpdate || youtubeBusy" @click="closePanel">
              <Icon name="close" />
            </button>
          </div>
          <YouTubeSetup v-if="panel === 'youtube'" :native="native" :save-app="saveYouTube" :open-app="openYouTube" @busy="youtubeBusy = $event" @detected="youtubeDetected = $event" />
          <AudioControls
            v-else-if="panel === 'audio'"
            :state="audioState"
            :volume="audioVolume"
            :busy="audioBusy"
            :switching="audioSwitching"
            :error="audioError"
            :native="native"
            @volume="audio.setVolume"
            @mute="audio.toggleMute"
            @output="audio.setOutput"
            @refresh="audio.refresh(true)"
          />
          <template v-else-if="panel === 'quick' && quickApp">
            <div class="quick-actions power-options">
              <template v-if="quickSession">
                <button
                  :disabled="quickSession.status === 'untracked'"
                  @click="resumeSession(quickApp.id)"
                >
                  <Icon name="play" /><span>Reprendre</span>
                </button>
                <button @click="closeSession(quickApp.id, true)">
                  <Icon name="close" /><span>{{
                    quickSession.status === "untracked"
                      ? "Ne plus suivre"
                      : "Fermer normalement"
                  }}</span>
                </button>
                <button
                  v-if="quickSession.canForce"
                  class="danger"
                  @click="forceSession(quickApp.id)"
                >
                  <Icon name="power" /><span>Forcer la fermeture</span>
                </button>
              </template>
              <p v-if="quickSession?.status === 'untracked'" class="note">
                Fenêtre partagée ou non identifiable : reprenez-la avec Alt +
                Tab.
              </p>
              <button :aria-pressed="favorite(quickApp.id)" @click="toggleFavorite(quickApp.id)"><Icon name="home" /><span>{{ favorite(quickApp.id) ? 'Retirer des favoris' : 'Ajouter aux favoris' }}</span></button>
              <button :class="{ 'action-group-start': !!quickSession }" @click="edit(quickApp)">
                <Icon name="edit" /><span>Modifier</span>
              </button>
              <button @click="openPanel('move')">
                <Icon name="right" /><span>Déplacer</span>
              </button>
              <button class="danger action-remove" @click="removeQuick">
                <Icon name="trash" /><span>Retirer la carte</span>
              </button>
            </div>
          </template>
          <template v-else-if="panel === 'move' && quickApp">
            <p class="panel-intro">
              {{ quickApp.name }} · Position {{ quickIndex + 1 }} sur
              {{ config.apps.length }}
            </p>
            <p class="note">Déplacer une carte active le tri « Mon ordre ».</p>
            <div class="quick-actions power-options">
              <button :disabled="quickIndex <= 0" @click="moveQuick(-1)">
                <Icon name="back" /><span>Déplacer avant</span>
              </button>
              <button
                :disabled="quickIndex >= config.apps.length - 1"
                @click="moveQuick(1)"
              >
                <Icon name="right" /><span>Déplacer après</span>
              </button>
              <button data-move-done @click="closePanel">
                <Icon name="check" /><span>Terminé</span>
              </button>
            </div>
          </template>
          <template v-else-if="panel === 'settings'">
            <div class="settings-layout">
              <nav class="settings-nav" aria-label="Catégories des paramètres">
                <button
                  v-for="(category, key) in settingsSections"
                  :key="key"
                  :data-focus-key="`settings:${key}`"
                  :class="{ active: settingsSection === key }"
                  :aria-current="settingsSection === key ? 'page' : undefined"
                  @click="settingsTab = category.page"
                >
                  <Icon class="settings-category-icon" :name="category.icon" :size="19" />
                  <span>{{ category.label }}</span><Icon class="settings-chevron" name="right" :size="15" /></button
                ><small>Canapey {{ version }}</small>
              </nav>
              <div :key="settingsTab" class="settings-content">
                <div v-if="settingsSection === 'devices'" class="settings-subnav" role="group" aria-label="Périphériques"><button :aria-pressed="settingsTab === 'controls'" @click="settingsTab = 'controls'">Manette</button><button :aria-pressed="settingsTab === 'remote'" @click="settingsTab = 'remote'">Télécommande</button></div>
                <div v-if="settingsSection === 'help'" class="settings-subnav" role="group" aria-label="Aide"><button :aria-pressed="settingsTab === 'updates'" @click="settingsTab = 'updates'">Mises à jour</button><button :aria-pressed="settingsTab === 'diagnostic'" @click="settingsTab = 'diagnostic'">Diagnostic</button></div>
                <div v-if="settingsTab === 'remote'">
                  <div v-if="remoteDevice === 'iphone'" class="remote-device-tabs" role="group" aria-label="Type de télécommande">
                    <button class="small-button" aria-pressed="false" @click="remoteDevice = 'flirc'">Skip 1s / Flirc</button>
                    <button class="small-button" aria-pressed="true" @click="remoteDevice = 'iphone'">iPhone</button>
                  </div>
                  <AppleRemoteSettings v-if="remoteDevice === 'iphone'" :native="native" :settings="config.settings.appleRemote" :save-settings="saveAppleRemote" />
                <RemoteHomeSettings
                  v-else
                  :native="native"
                  :bindings="config.settings.remoteBindings ?? []"
                  :apps="config.apps"
                  :save-bindings="saveRemoteBindings"
                  @capturing="remoteCaptureChanged"
                >
                  <template #title>
                    <div id="remote-title" class="remote-device-tabs in-heading" role="group" aria-label="Type de télécommande">
                      <button class="small-button" aria-pressed="true" @click="remoteDevice = 'flirc'">Skip 1s / Flirc</button>
                      <button class="small-button" aria-pressed="false" @click="remoteDevice = 'iphone'">iPhone</button>
                    </div>
                  </template>
                </RemoteHomeSettings>
                </div>
                <template v-if="settingsTab === 'system'"
                  ><h3>Démarrage et système</h3>
                  <label class="setting-row"
                    ><span>Plein écran au démarrage</span
                    ><input
                      v-model="config.settings.fullscreen"
                      type="checkbox"
                      role="switch"
                      @change="persist" /></label
                  ><label class="setting-row"
                    ><span
                      >Démarrer avec Windows<small
                        >À l’ouverture de votre session.</small
                      ></span
                    ><input
                      v-model="config.settings.autostart"
                      :disabled="!native"
                      type="checkbox"
                      role="switch"
                      @change="persist" /></label
                  ></template>
                <template v-if="settingsTab === 'display'"><h3>Affichage et ambiance</h3><label class="setting-row"
                    ><span
                      >Écran préféré<small
                        >Écran principal si la TV est absente.</small
                      ></span
                    ><select
                      v-model="config.settings.monitor"
                      @change="persist"
                    >
                      <option :value="null">Écran principal</option>
                      <option
                        v-for="m in monitorList"
                        :key="m.id"
                        :value="m.id"
                      >
                        {{ m.name }}
                      </option>
                    </select></label
                  ><label class="setting-row"
                    ><span
                      >Taille de l’interface<small
                        >{{ Math.round(config.settings.scale * 100) }} %</small
                      ></span
                    ><input
                      v-model.number="config.settings.scale"
                      type="range"
                      min="0.8"
                      max="1.4"
                      step="0.1"
                      @change="persist" /></label
                ></template>
                <div v-if="settingsTab === 'system'" class="system-actions"><button class="small-button" @click="run('Retour Windows', api.desktop)"><Icon name="monitor" :size="20" />Retour au bureau Windows</button><button class="small-button" @click="openPanel('power')"><Icon name="power" :size="20" />Alimentation</button></div>
                <template v-if="settingsTab === 'apps'"
                  ><div class="content-heading">
                    <h3>Vos applications</h3>
                    <button
                      class="small-button"
                      @click="
                        openAdd();
                      "
                    >
                      <Icon name="plus" :size="18" />Ajouter
                    </button>
                  </div>
                  <RemovalNotice v-if="removedApp" :name="removedApp.app.name" :busy="restoreBusy" :error="restoreError" @restore="restoreRemovedApp" @dismiss="dismissRemoval" />
                  <p class="note">Les favoris apparaissent sur l’accueil. Les flèches activent le tri « Mon ordre » dans la bibliothèque.</p>
                  <p v-if="!config.apps.length" class="muted">
                    Aucune application ajoutée.
                  </p>
                  <div
                    v-for="(a, i) in config.apps"
                    :key="a.id"
                    class="manage-app"
                  >
                    <button
                      class="manage-name"
                      :data-focus-key="`${a.id}:name`"
                      @click="edit(a)"
                    >
                      <span class="order-number">{{
                        String(i + 1).padStart(2, "0")
                      }}</span
                      ><span
                        >{{ a.name
                        }}<small>{{
                          a.target.kind === "uri"
                            ? "Raccourci web / URI"
                            : a.source
                        }}</small></span
                      ></button
                    ><button class="icon-button" :aria-label="`${favorite(a.id) ? 'Retirer des' : 'Ajouter aux'} favoris : ${a.name}`" :aria-pressed="favorite(a.id)" @click="toggleFavorite(a.id)"><Icon name="home" :size="20" /></button><button
                      class="icon-button"
                      :disabled="i === 0"
                      :aria-label="`Avancer ${a.name}`"
                      :data-focus-key="`${a.id}:up`"
                      @click="moveApp(i, -1)"
                    >
                      <Icon name="up" :size="18" /></button
                    ><button
                      class="icon-button"
                      :disabled="i === config.apps.length - 1"
                      :aria-label="`Reculer ${a.name}`"
                      :data-focus-key="`${a.id}:down`"
                      @click="moveApp(i, 1)"
                    >
                      <Icon name="down" :size="18" /></button
                    ><button
                      class="icon-button"
                      :aria-label="`Modifier ${a.name}`"
                      :data-focus-key="`${a.id}:edit`"
                      @click="edit(a)"
                    >
                      <Icon name="edit" :size="18" />
                    </button></div
                ></template>
                <template v-if="settingsTab === 'controls'"
                  ><h3>Manette et navigation</h3>
                  <div class="device-line">
                    <Icon name="controller" :size="28" />
                    <div>
                      {{ controller ?? "Aucune manette connectée"
                      }}<small
                        >Xbox, PlayStation et Nintendo reconnues par Windows</small
                      >
                    </div>
                  </div>
                  <label class="setting-row home-shortcut-row"
                    ><span
                      >Retour global à l’accueil<small
                        >{{ config.settings.returnShortcut === 'xbox'
                          ? 'Un appui Xbox, ou Start + Back maintenus en secours.'
                          : 'Maintenir les boutons, sans fermer l’application.' }}</small
                      ></span
                    ><select
                      v-model="config.settings.returnShortcut"
                      @change="persist"
                    >
                      <option value="xbox">Touche Xbox</option>
                      <option value="startBack">Start + Back</option>
                      <option value="shouldersStart">LB + RB + Start</option>
                      <option value="disabled">Désactivé</option>
                    </select></label
                  ><label class="setting-row"
                    ><span
                      >Maintien des combinaisons<small
                        >{{
                          (config.settings.holdMs / 1000).toFixed(1)
                        }}
                        s</small
                      ></span
                    ><input
                      v-model.number="config.settings.holdMs"
                      type="range"
                      min="600"
                      max="4000"
                      step="200"
                      @change="persist" /></label
                  ><label class="setting-row"
                    ><span
                      >Zone neutre du stick<small
                        >{{
                          Math.round(config.settings.deadzone * 100)
                        }}
                        %</small
                      ></span
                    ><input
                      v-model.number="config.settings.deadzone"
                      type="range"
                      min="0.1"
                      max="0.5"
                      step="0.05"
                      @change="persist" /></label>
                  <button class="small-button" :aria-expanded="showControllerTest" @click="showControllerTest = !showControllerTest">{{ showControllerTest ? 'Masquer le test de la manette' : 'Tester la manette' }}</button>
                  <ControllerTester v-if="showControllerTest" :snapshot="controllerSnapshot" :controller-name="controller" :testing="controllerTesting" :native="native" :deadzone="config.settings.deadzone" @toggle="toggleControllerTest" @deadzone="setDeadzone" />
                  <button class="disclosure-button" :aria-expanded="controllerHelp" @click="controllerHelp = !controllerHelp">Dépannage Xbox / Steam Input<Icon :name="controllerHelp ? 'up' : 'down'" :size="18" /></button>
                  <div v-if="controllerHelp"><XboxHomeSettings :native="native" /><p class="note">
                    Steam Input peut intercepter ces boutons. Désactivez sa
                    configuration Bureau ou choisissez une autre combinaison.
                  </p></div></template>
                <template v-if="settingsTab === 'display'">
                  <h3 class="settings-subheading">Ambiance</h3>
                  <p class="note">Personnalisez l’image et les sons de Canapey. Les changements s’appliquent immédiatement.</p>
                  <div class="ambiance-gallery" role="group" aria-label="Ambiances générales">
                    <button v-for="ambiance in generalAmbiances" :key="ambiance.id"
                      class="ambiance-choice" :aria-label="ambiance.name" :title="ambiance.description"
                      :aria-pressed="config.settings.generalAmbiance === ambiance.id"
                      @click="selectGeneralAmbiance(ambiance.id)">
                      <img :src="`/art/${ambiance.id}-card.webp`" alt="" loading="lazy" />
                      <span>{{ ambiance.name }}</span>
                      <Icon v-if="config.settings.generalAmbiance === ambiance.id" name="check" :size="18" />
                    </button>
                  </div>
                  <p class="ambiance-choice-hint">Choisissez une ambiance pour la conserver partout, ou activez les fonds par application ci-dessous.</p>
                  <div class="ambiance-preview" aria-label="Aperçu du fond d’écran">
                    <img :src="heroBg" alt="" />
                    <span>Aperçu du fond</span>
                  </div>
                  <label class="setting-row">
                    <span>Fond lié à l’application<small>Chaque application a son univers. L’accueil garde votre ambiance générale.</small></span>
                    <input v-model="config.settings.dynamicBackground" type="checkbox" role="switch" @change="persist" />
                  </label>
                  <label class="setting-row">
                    <span>Luminosité du fond<small>{{ Math.round(config.settings.backgroundBrightness * 100) }} %</small></span>
                    <input v-model.number="config.settings.backgroundBrightness" type="range" min="0.3" max="1" step="0.05" @change="persist" />
                  </label>
                  <label class="setting-row">
                    <span>Flou du fond<small>{{ config.settings.backgroundBlur === 0 ? 'Aucun' : config.settings.backgroundBlur + ' px' }}</small></span>
                    <input v-model.number="config.settings.backgroundBlur" type="range" min="0" max="12" step="1" @change="persist" />
                  </label>
                  <label class="setting-row"
                    ><span>Animations<small>{{ osReducedMotion ? 'Réduites selon vos préférences système.' : 'Transitions entre les cartes et les fonds.' }}</small></span
                    ><input
                      v-model="config.settings.motion"
                      type="checkbox"
                      role="switch"
                      @change="persist" /></label
                  ><label class="setting-row"
                    ><span>Sons de navigation</span
                    ><input
                      v-model="config.settings.sound"
                      type="checkbox"
                      role="switch"
                      @change="persist"
                  /></label>
                  <label class="setting-row">
                    <span>Volume des sons<small>{{ Math.round(config.settings.soundVolume * 100) }} % · Sons de Canapey uniquement.</small></span>
                    <input v-model.number="config.settings.soundVolume" :disabled="!config.settings.sound" type="range" min="0" max="1" step="0.05" @change="persist(); sound()" />
                  </label>
                  <button class="small-button ambiance-sound-test" :disabled="!config.settings.sound || config.settings.soundVolume === 0" @click="sound">Écouter un son</button>
                </template>
                <template v-if="settingsTab === 'updates'"
                  ><div class="version-art">
                    <img src="/brand/canapey-mark.svg" width="48" height="48" alt="" /><span>canapey.</span
                    ><small>Version {{ version }}</small>
                  </div>
                  <h3 aria-live="polite" aria-atomic="true">
                    {{
                      checkingUpdates
                        ? "Recherche de mises à jour…"
                        : update?.state === "available"
                          ? `Version ${update.version} disponible`
                          : update?.state === "current"
                            ? "Vous êtes à jour."
                            : "Mises à jour"
                    }}
                  </h3>
                  <p v-if="update?.state === 'current'" class="muted">
                    Vous utilisez la dernière version disponible de Canapey.
                  </p>
                  <p v-else class="muted">
                    Canapey ferme les applications suivies avant l’installation,
                    puis redémarre. Vos réglages sont conservés.
                  </p>
                  <p v-if="sessions.some(session => session.status === 'untracked')" class="note">Les fenêtres partagées ou non identifiables restent ouvertes.</p>
                  <p v-if="update?.state === 'disabled'" class="note">
                    Les mises à jour ne sont pas encore configurées pour cette
                    distribution.
                  </p>
                  <p v-if="updateError" class="inline-error">
                    {{ updateError }}
                  </p>
                  <div class="update-actions">
                  <button
                    class="primary-button"
                    :disabled="!!working"
                    @click="checkUpdates"
                  >
                    <Icon name="update" :size="18" />Rechercher une mise à jour</button
                  ><button
                    v-if="update?.state === 'available'"
                    class="small-button"
                    :disabled="!!working"
                    @click="requestUpdateInstall"
                  >
                    {{ appsToClose.length ? 'Fermer les applications et installer' : 'Télécharger et installer' }}
                  </button></div>
                  <ReleaseNotes v-if="update?.notes" :notes="update.notes" /></template
                >
                <template v-if="settingsTab === 'diagnostic'"
                  ><h3>Diagnostic</h3>
                  <dl class="diagnostic">
                    <div>
                      <dt>Version</dt>
                      <dd>{{ version }}</dd>
                    </div>
                    <div>
                      <dt>Plateforme</dt>
                      <dd>
                        {{
                          native ? "Windows 11 x64" : "Aperçu de l’interface"
                        }}
                      </dd>
                    </div>
                    <div>
                      <dt>Applications suivies</dt>
                      <dd>{{ sessions.length }}</dd>
                    </div>
                    <div>
                      <dt>Manette</dt>
                      <dd>{{ controller ?? "Non connectée" }}</dd>
                    </div>
                  </dl>
                  <div
                    v-for="session in sessions"
                    :key="session.appId"
                    class="session-detail"
                  >
                    <span>{{ session.name }}</span
                    ><button
                      class="small-button"
                      :disabled="session.status === 'untracked'"
                      @click="resumeSession(session.appId)"
                    >
                      Reprendre</button
                    ><button
                      class="small-button"
                      @click="closeSession(session.appId)"
                    >
                      {{
                        session.status === "untracked"
                          ? "Ne plus suivre"
                          : "Fermer"
                      }}</button
                    ><button
                      v-if="session.canForce"
                      class="small-button danger"
                      @click="forceSession(session.appId)"
                    >
                      Forcer
                    </button>
                  </div>
                  <button
                    class="small-button"
                    @click="run('Ouverture des logs', api.logs)"
                  >
                    <Icon name="folder" :size="18" />Ouvrir les logs
                  </button>
                  <p class="note">
                    Sortie de secours : <b>Ctrl + Maj + Q</b>.<br />Alt + F4
                    ferme également Canapey.<br />Rouvrez-le depuis l’icône de
                    notification ou son raccourci.
                  </p>
                  <button
                    class="text-button danger"
                    @click="
                      confirm(
                        'Quitter Canapey ?',
                        'Vos applications resteront ouvertes.',
                        'Quitter',
                        api.quit,
                      )
                    "
                  >
                    Quitter Canapey
                  </button></template
                >
              </div>
            </div>
          </template>
          <template v-else-if="panel === 'add'">
            <p class="panel-intro">
              Sélectionnez vos applications, puis ajoutez-les à votre bibliothèque.
            </p>
            <div class="import-toolbar">
              <label class="search-field"
                ><Icon name="search" :size="19" /><input
                  v-model="query"
                  type="search"
                  placeholder="Rechercher une application"
                  aria-label="Rechercher une application" /></label
              ><button
                class="small-button"
                aria-label="Clavier pour rechercher"
                @click="keyboardFor('input[type=search]')"
              >
                Clavier</button
              ><button
                class="small-button"
                :disabled="scanBusy || !native"
                @click="scan"
              >
                <Icon name="refresh" :size="18" />{{
                  scanBusy
                    ? "Recherche…"
                    : scanned
                      ? "Actualiser"
                      : "Détecter mes applications"
                }}</button
              ><button class="small-button" :disabled="!native" @click="manual">
                <Icon name="folder" :size="18" />Parcourir
              </button>
            </div>
            <div class="import-filters">
              <div class="quick-search" aria-label="Recherches rapides">
                <button
                  v-for="name in [
                    'YouTube',
                    'Netflix',
                    'Spotify',
                    'Plezy',
                    'Steam',
                    'Silo',
                  ]"
                  :key="name"
                  :class="{ active: query === name }"
                  @click="query = query === name ? '' : name"
                >
                  {{ name }}
                </button>
              </div>
              <label class="system-filter">
                <input v-model="showSystemTools" type="checkbox" />
                Afficher les outils système
              </label>
            </div>
            <div class="detected-list">
              <div v-if="scanBusy" class="empty-search">
                <span class="spinner" />Recherche dans le menu Démarrer, le
                bureau et les applications enregistrées…
              </div>
              <p v-else-if="scanError" class="inline-error">{{ scanError }}</p>
              <div v-else-if="!native" class="empty-search">
                <Icon name="monitor" :size="32" />
                <p>
                  La détection et l’ajout d’applications sont disponibles sous
                  Windows.
                </p>
              </div>
              <div v-else-if="!scanned" class="empty-search">
                <Icon name="search" :size="30" />Lancez la détection pour
                retrouver vos applications.
              </div>
              <div v-else-if="!filtered.length" class="empty-search">
                Aucune application trouvée{{
                  query ? ` pour « ${query} »` : ""
                }}. {{
                  showSystemTools
                    ? 'Essayez l’ajout manuel.'
                    : 'Essayez d’afficher les outils système ou utilisez Parcourir.'
                }}
              </div>
              <button
                v-for="a in filtered"
                :key="a.id"
                class="detected-app"
                :class="{
                  chosen: chosen.has(a.id),
                  'already-added': isAlreadyAdded(a),
                }"
                :aria-pressed="chosen.has(a.id) || isAlreadyAdded(a)"
                :disabled="isAlreadyAdded(a)"
                @click="toggleChoice(a.id)"
              >
                <span class="checkbox"
                  ><Icon
                    v-if="chosen.has(a.id) || isAlreadyAdded(a)"
                    name="check"
                    :size="16" /></span
                ><img v-if="a.icon" :src="api.imageUrl(a.icon)" alt="" /><span
                  class="detected-name"
                  >{{ a.name }}<small>{{ a.source }}</small></span
                >
                <span v-if="isAlreadyAdded(a)" class="added-label"
                  >Déjà ajoutée</span
                >
              </button>
            </div>
            <div v-if="selectedImports.length" class="import-action">
              <span
                >{{ selectedImports.length }} sélectionnée{{
                  selectedImports.length > 1 ? "s" : ""
                }}</span
              ><button
                class="primary-button"
                @click="addEntries(selectedImports)"
              >
                Ajouter {{ selectedImports.length }} application{{ selectedImports.length > 1 ? 's' : '' }}<Icon name="plus" :size="18" />
              </button>
            </div>
          </template>
          <template v-else-if="panel === 'edit' && editing">
            <div class="edit-layout">
              <div class="edit-preview">
                <AppCard
                  inert
                  :name="editing.name"
                  :theme="editing.theme"
                  :icon="api.imageUrl(editing.icon)"
                  :image="
                    api.imageUrl(editing.card) ||
                    `/art/${editing.theme}-card.webp`
                  "
                  selected
                />
                <div class="image-actions">
                  <button class="small-button" @click="imagePick('card')">
                    Image de carte</button
                  ><button
                    class="small-button"
                    @click="imagePick('background')"
                  >
                    Fond d’écran</button
                  ><button
                    class="text-button"
                    @click="
                      editing.card = null;
                      editing.background = null;
                    "
                  >
                    Visuels d’origine
                  </button>
                </div>
              </div>
              <div class="edit-fields">
                <label
                  >Nom<input
                    v-model="editing.name"
                    aria-label="Nom"
                    maxlength="100" /></label
                ><button
                  class="small-button"
                  aria-label="Clavier pour le nom"
                  @click="keyboardFor('input[aria-label=Nom]')"
                >
                  Clavier</button
                ><label>Catégorie<select v-model="editingCategory"><option value="auto">Automatique ({{ categories[categoryFor(editing, { ...config.settings.library, categories: {} })] }})</option><option v-for="(label, key) in categories" :key="key" :value="key">{{ label }}</option></select></label><label
                  >Ambiance<select v-model="editing.theme">
                    <option
                      v-for="t in [
                        'home',
                        'netflix',
                        'youtube',
                        'spotify',
                        'internet',
                        'steam',
                        'plezy',
                        'silo',
                      ]"
                      :key="t"
                      :value="t"
                    >
                      {{ t === "home" ? "Ambiance générale" : t === "silo" ? "Silo · Streaming" : t }}
                    </option>
                  </select></label
                ><label
                  >Cible<input
                    v-model="editing.target.value"
                    spellcheck="false" /></label
                ><template
                  v-if="
                    ['executable', 'shortcut'].includes(editing.target.kind)
                  "
                  ><label
                    >Arguments<small
                      >Un argument par ligne, sans guillemets
                      supplémentaires.</small
                    ><textarea
                      v-model="argumentsText"
                      rows="3"
                      spellcheck="false"
                    /></label
                  ><label
                    >Dossier de travail<input
                      v-model="editing.target.workingDir"
                      spellcheck="false" /></label
                ></template>
                <div class="edit-footer">
                  <button
                    v-if="config.apps.some((a) => a.id === editing?.id)"
                    class="text-button danger"
                    @click="
                      confirm(
                        'Retirer cette carte ?',
                        'L’application restera installée sur votre PC.',
                        'Retirer',
                        removeApp,
                      )
                    "
                  >
                    <Icon name="trash" :size="18" />Retirer</button
                  ><button class="primary-button" @click="saveEditing">
                    Enregistrer<Icon name="check" :size="18" />
                  </button>
                </div>
              </div>
            </div>
          </template>
          <template v-else-if="panel === 'power'"
            ><div class="power-options">
              <button @click="run('Retour Windows', api.desktop)"><Icon name="monitor" /><span>Retour au bureau Windows</span><Icon name="right" :size="18" /></button>
              <button
                @click="
                  confirm(
                    'Mettre le PC en veille ?',
                    'Votre session sera conservée.',
                    'Mettre en veille',
                    sleepPc,
                  )
                "
              >
                <Icon name="moon" /><span>Mettre en veille</span
                ><Icon name="right" :size="18" /></button
              ><button
                @click="
                  confirm(
                    'Redémarrer le PC ?',
                    'Enregistrez votre travail dans les applications ouvertes.',
                    'Redémarrer',
                    restartPc,
                  )
                "
              >
                <Icon name="restart" /><span>Redémarrer</span
                ><Icon name="right" :size="18" /></button
              ><button
                @click="
                  confirm(
                    'Éteindre le PC ?',
                    'Enregistrez votre travail dans les applications ouvertes.',
                    'Éteindre',
                    shutdownPc,
                  )
                "
              >
                <Icon name="power" /><span>Éteindre</span
                ><Icon name="right" :size="18" />
              </button>
              <button
                @click="
                  confirm(
                    'Quitter Canapey ?',
                    'Vos applications resteront ouvertes.',
                    'Quitter',
                    api.quit,
                  )
                "
              >
                <Icon name="close" /><span>Quitter le launcher</span
                ><Icon name="right" :size="18" />
              </button></div
          ></template>
          <template v-else-if="panel === 'session'"
            ><p class="panel-intro">
              {{
                selectedSession?.status === "untracked"
                  ? "Ce lancement utilise une fenêtre partagée ou non identifiable. Reprenez-la avec Alt + Tab."
                  : "Votre application est toujours ouverte."
              }}
            </p>
            <div class="power-options">
              <button
                :disabled="selectedSession?.status === 'untracked'"
                @click="run('Reprise', resumeCurrent)"
              >
                <Icon name="play" /><span>Reprendre</span></button
              ><button @click="closeSession(current.id, true)">
                <Icon name="close" /><span>{{
                  selectedSession?.status === "untracked"
                    ? "Ne plus suivre ce lancement"
                    : "Fermer normalement"
                }}</span></button
              ><button
                v-if="selectedSession?.canForce"
                class="danger"
                @click="
                  confirm(
                    'Forcer la fermeture ?',
                    'Les données non enregistrées de cette application peuvent être perdues. Seuls les processus lancés et identifiés par Canapey seront arrêtés.',
                    'Forcer la fermeture',
                    forceCurrent,
                  )
                "
              >
                <Icon name="power" /><span>Forcer la fermeture</span>
              </button>
            </div>
            <p v-if="selectedSession?.status === 'closing'" class="note">
              Fermeture demandée. Si l’application ne répond pas, une option de
              fermeture forcée apparaît après 5 secondes.
            </p></template
          >
          <template v-else-if="panel === 'confirm'"
            ><p class="confirm-copy">{{ confirmText }}</p>
            <p v-if="installingUpdate" class="update-progress" role="status">{{ updateStatus }}</p>
            <div class="confirm-actions">
              <button class="small-button" :disabled="installingUpdate" @click="closePanel">Annuler</button
              ><button
                class="primary-button"
                :disabled="!!working"
                @click="acceptConfirm"
              >
                {{ confirmLabel }}
              </button>
            </div></template
          >
          <div class="panel-footer" aria-live="polite">
            <span v-if="controllerTesting"
              >Maintenir {{ inputLabels.backName }} 1,2 s : arrêter le test · Échap au
              clavier</span
            >
            <template v-else
              ><span
                ><kbd :class="{ 'pad-key': controller }">{{ inputLabels.back }}</kbd
                >Retour</span
              ><span v-if="editingControl">{{
                isTextControl(editingControl)
                  ? "Saisie · Entrée pour terminer · Maj+Entrée pour une nouvelle ligne"
                  : "Flèches pour régler · OK pour terminer"
              }}</span
              ><span v-else-if="panel === 'audio'"
                >↑ ↓ Naviguer · ← → Volume ·
                {{ inputLabels.acceptName }} Choisir</span
              ><span v-else-if="panel === 'settings' && settingsSaveStatus" class="save-status" role="status">{{ settingsSaveStatus }}</span><span v-else>{{
                controller
                  ? `Croix directionnelle : naviguer · ${inputLabels.acceptName} : OK`
                  : "Flèches : naviguer · Entrée : OK / modifier"
              }}</span></template
            >
          </div>
        </section>
      </div>
    </Transition>
    <OnScreenKeyboard
      v-if="keyboardTarget"
      ref="screenKeyboard"
      v-bind="keyboardEntry"
      @done="closeKeyboard"
      @cancel="closeKeyboard()"
    />
  </main>
</template>

<style scoped>
.remote-device-tabs{display:flex;gap:8px;margin-bottom:22px}.remote-device-tabs.in-heading{margin-bottom:0}.remote-device-tabs.in-heading button{padding:6px 10px;font-size:12px}.remote-device-tabs button[aria-pressed="true"]{background:#ffffff18;border-color:#ffffff50;color:#fff}
</style>
