<script setup lang="ts">
import { t, locale, languageOptions, setLocale, type Locale } from './lib/i18n';
import {
  computed, defineAsyncComponent, ref, watch, onMounted, onUnmounted, nextTick,
} from "vue";
import { categories, categoryFor, homeApps, groupLibraryCards, type AppCategory, type LibraryFilter } from "./lib/library";
import { removeLibraryApp, restoreLibraryApp, type RemovedApp } from "./lib/library-editing";
import RemovalNotice from "./components/RemovalNotice.vue";
import { isVacuumTube, registerYouTube } from './lib/youtube';
const YouTubeSetup = defineAsyncComponent(() => import('./components/YouTubeSetup.vue'));
const siloTile: Tile = { id: 'catalog-silo', name: 'Silo', theme: 'silo' };
const siloKey = 'canapey-silo-server';
const siloAddress = ref(localStorage.getItem(siloKey) ?? '');
const siloError = ref('');
const siloEditing = ref(false);
const siloOpening = ref(false);
async function configureSilo(error = '', editAddress = !error) {
  siloError.value = error;
  siloEditing.value = editAddress;
  await openPanel('silo');
  await nextTick();
  focusElement(panelRoot.value?.querySelector<HTMLElement>('[data-silo-primary]') ?? undefined);
}
async function editSiloAddress() {
  await closePanel();
  siloAddress.value = localStorage.getItem(siloKey) ?? '';
  await configureSilo();
}
async function openSilo() {
  if (siloOpening.value) return;
  if (!siloAddress.value.trim()) return configureSilo();
  let url: URL;
  try {
    url = new URL(siloAddress.value.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash)
      throw new Error();
  } catch {
    await configureSilo(t('Enter a valid HTTP or HTTPS server address.'), true);
    return;
  }
  siloOpening.value = true;
  try {
    localStorage.setItem(siloKey, url.href);
    siloAddress.value = url.href;
    if (panel.value === 'silo') await closePanel();
    await api.openSilo(url.href);
  } catch (error) {
    await configureSilo(native.value ? t('Could not open your Silo server.') : String(error instanceof Error ? error.message : error));
  } finally { siloOpening.value = false; }
}
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
  if (!(await saveYouTube(app))) throw new Error(t('The YouTube card was not saved. Try again.'));
  dismissPanels(); resetLibrary(); view.value = 'grid';
  await nextTick();
  selected.value = reconcileSelection(tiles.value.map(tile => tile.id), config.value.selectedId);
  await focusCard();
  const entry = config.value.apps.find(isVacuumTube)!;
  await activate({id:entry.id,name:entry.name,theme:entry.theme,entry}, true);
}
import AddApps from "./components/AddApps.vue";
import { controllerLabels } from "./lib/controller-labels";
import { CardHold } from "./lib/hold";
import Icon from "./components/Icon.vue";
import SettingsMenu from './components/SettingsMenu.vue';
import SettingChoice from './components/SettingChoice.vue';
import { isSettingsPage, type SettingsPage } from './lib/settings-navigation';
import AudioControls from "./components/AudioControls.vue";
import { createAudioControls } from "./lib/audio";
import { selectorColors, type SelectorColor } from "./lib/selector-colors";
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
const TvSettings = defineAsyncComponent(() => import("./components/TvSettings.vue"));
const AppleRemoteSettings = defineAsyncComponent(() => import("./components/AppleRemoteSettings.vue"));
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
  return queueSave({ remoteHomeUpdate: true });
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
  else if (action === 'library') { dismissPanels(); showLibrary(); }
  else if (action === 'audio') void openAudio();
  else if (action === 'power') void openPanel('power');
  else if (action === 'home' && !native.value) dispatch('home');
  else if (native.value) void runRemoteAction(binding.button).catch(notify);
  else notify(t('This action requires Canapey on Windows.'));
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
  | "repair"
  | "edit"
  | "power"
  | "session"
  | "confirm"
  | "quick"
  | "move"
  | "silo"
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
watch(() => config.value.settings.selectorColor, (color) => {
  document.documentElement.style.setProperty('--accent', selectorColors[color ?? 'blue'].color);
}, { immediate: true });

function selectColor(color: SelectorColor) {
  if (config.value.settings.selectorColor === color) return;
  config.value.settings.selectorColor = color;
  void persist();
}

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
  ? t('Volume unavailable')
  : t(audioState.value?.muted ? 'Muted · Volume {0}%' : 'Volume {0}%', [headerVolume.value]));
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
const choiceTarget = ref<HTMLSelectElement | null>(null);
const settingChoice = ref<InstanceType<typeof SettingChoice>>();
async function closeChoice(index?: number) {
  const target = choiceTarget.value;
  if (!target) return;
  if (index !== undefined) {
    target.selectedIndex = index;
    target.dispatchEvent(new Event('change', { bubbles: true }));
  }
  choiceTarget.value = null;
  await nextTick();
  focusElement(target);
}

const keyboardEntry = ref({
  value: "",
  get label() { return t('Text entry'); },
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
      t('Text entry'),
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
  editingControl.value = null;
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
const checkingUpdates = computed(() => working.value === t('Checking for updates'));
const panelRoot = ref<HTMLElement>(),
  cardsRoot = ref<HTMLElement>(),
  width = ref(window.innerWidth),
  height = ref(window.innerHeight);
const lastSettingsPage = ref("display"),
  monitorList = ref<Monitor[]>([]);
const discoveredApps = ref<AppEntry[] | null>(null);
const importQuery = ref('');
const appPicker = ref<InstanceType<typeof AddApps>>();
const settingsRoute = ref<SettingsPage>('display');
const settingsIndex = ref(true);
const settingsMenu = ref<InstanceType<typeof SettingsMenu>>();
const linkedFrom = ref<SettingsPage | null>(null);
const preferredMonitor = computed(() => monitorList.value.find(monitor => monitor.id === config.value.settings.monitor));
function openSettingsRoute(route: SettingsPage, linked = false) {
  linkedFrom.value = linked ? settingsRoute.value : null;
  settingsRoute.value = route;
  settingsIndex.value = false;
  editingControl.value = null;
  lastSettingsPage.value = route;
}
function backSettings() {
  if (settingsMenu.value?.closeSearch()) return;
  if (linkedFrom.value && !settingsIndex.value) {
    openSettingsRoute(linkedFrom.value);
  } else if (!settingsIndex.value) {
    settingsIndex.value = true;
    nextTick(() => settingsMenu.value?.focusRail());
  } else {
    void closePanel();
  }
}
const settingsSaveStatus = ref('');
const filterBar = ref<HTMLElement>();
const libraryFilter = ref<LibraryFilter>('all');
const libraryFilters = computed(() => ({ all: t('All'), favorites: t('Favorites'), ...categories }));
const libraryFiltered = computed(() => libraryFilter.value !== 'all');
const removedApp = ref<RemovedApp | null>(null);
const restoreBusy = ref(false), restoreError = ref('');
const editingCategory = ref<AppCategory | 'auto'>('auto');
const showControllerTest = ref(false);
const controllerHelp = ref(false);
const favorite = (id: string) => config.value.settings.library.favorites.includes(id);
async function toggleFavorite(id: string) {
  const list = config.value.settings.library.favorites;
  config.value.settings.library.favorites = list.includes(id) ? list.filter(value => value !== id) : [...list, id];
  if (await persist()) notify(favorite(id) ? t('Added to Home favorites.') : t('Removed from favorites.'));
}
function focusLibraryFilter() {
  focusElement(filterBar.value?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]') ?? undefined);
}
function resetLibrary() {
  const restoreFilterFocus = !!document.activeElement?.closest('.library-empty, .reset-filters');
  libraryFilter.value = 'all';
  if (restoreFilterFocus) void nextTick(focusLibraryFilter);
}
function showLibrary() { resetLibrary(); view.value = 'grid'; void focusCard(); }
async function openAdd(search = '') {
  importQuery.value = search;
  await openPanel('add');
}
const controllerTesting = ref(false);
const controllerSnapshot = ref<ControllerSnapshot | null>(null);
async function toggleControllerTest() {
  await run(t('Controller test'), async () => {
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
  confirmLabel = ref(t('Confirm'));
const forceTarget = ref<string | null>(null);
let confirmAction: () => Promise<unknown> = async () => {};
let toastTimer: ReturnType<typeof setTimeout>,
  clockTimer: ReturnType<typeof setInterval>,
  updateTimer: ReturnType<typeof setTimeout>;
let stopNative = () => {};
let resizeObserver: ResizeObserver;
let saveRequest = 0;
let saveChain: Promise<boolean> = Promise.resolve(true);
let selectionSaveTimer: ReturnType<typeof setTimeout> | undefined;
let lastSaved = defaults();
let audioContext: AudioContext | undefined;
const youtubeTile: Tile = { id: 'catalog-youtube', name: 'YouTube', theme: 'youtube', catalog: true, suggestion: true };
const examples: Tile[] = [
  {
    id: "suggest-netflix",
    name: "Netflix",
    theme: "netflix",
    suggestion: true,
  },
  youtubeTile,
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
  { id: "suggest-launchbox", name: "LaunchBox", theme: "launchbox", suggestion: true },
  { id: "suggest-steam", name: "Steam", theme: "steam", suggestion: true },
  { id: "suggest-plezy", name: "Plezy", theme: "plezy", suggestion: true },
];
function appTile(entry: AppEntry): Tile {
  return { id: entry.id, name: entry.name, theme: entry.theme, entry };
}
function initialTiles(): Tile[] {
  return [{ id: 'add', name: t('Add apps'), theme: 'home', special: 'add' }, ...examples];
}
const homeTiles = computed(() => {
  const { apps, settings } = config.value;
  const visible = apps.length ? homeApps(apps, settings.library, sessions.value).map(appTile) : initialTiles();
  const youtube = apps.find(isVacuumTube);
  if (youtube && !visible.some(tile => tile.id === youtube.id)) visible.push(appTile(youtube));
  if (apps.length && !youtube) visible.push(youtubeTile);
  const position = Math.min(settings.library.siloHomePosition ?? visible.length, visible.length);
  visible.splice(position, 0, siloTile);
  return visible;
});
const libraryCards = computed(() => {
  const { apps, settings } = config.value;
  const cards: (Tile & { category: AppCategory; favorite: boolean })[] =
    apps.map(app => ({ ...appTile(app), category: categoryFor(app, settings.library), favorite: favorite(app.id) }));
  if (!apps.some(isVacuumTube)) cards.push({ ...youtubeTile, category: 'video', favorite: false });
  cards.push({ ...siloTile, category: 'video', favorite: false });
  return cards;
});
const libraryGroups = computed(() =>
  groupLibraryCards(libraryCards.value, config.value.settings.library.sort));
const hasHomeSelection = computed(() => config.value.apps.some(app => favorite(app.id) || sessions.value.some(session => session.appId === app.id)));
const tiles = computed<Tile[]>(() => {
  const { apps } = config.value;
  if (view.value === 'carousel') {
    if (!apps.length) return homeTiles.value;
    return [...homeTiles.value, { id: 'library', name: t('All apps'), theme: 'home', special: 'library' }];
  }
  if (!apps.length) return [...initialTiles(), siloTile];
  return libraryGroups.value[libraryFilter.value];
});
const current = computed<Tile>(() => tiles.value[Math.max(0, Math.min(selected.value, tiles.value.length - 1))]
  ?? { id: 'empty', get name() { return t('No results'); }, theme: 'home', special: 'empty' });
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
const sessionPanelId = ref<string | null>(null);
const panelSession = computed(() => sessions.value.find(session => session.appId === sessionPanelId.value));
const inputLabels = computed(() => controllerLabels(controller.value));
const time = computed(() =>
  clock.value.toLocaleTimeString(locale.value, {
    hour: "2-digit",
    minute: "2-digit",
  }),
);
const date = computed(() =>
  clock.value.toLocaleDateString(locale.value, {
    weekday: "long",
    day: "numeric",
    month: "long",
  }),
);
const heroTitle = computed(() =>
  current.value.special === "add"
    ? t('Add apps')
    : current.value.special === "library"
      ? t('Your entire library')
    : current.value.special === "windows"
      ? t('Return to the desktop.')
      : current.value.name,
);
const subtitle = computed(() =>
  current.value.id === siloTile.id ? t('Watch movies and series from your Silo server.') : current.value.catalog ? t('YouTube on your TV, built for a controller.') : current.value.special === "windows"
    ? t('Canapey stays open in the background.')
    : current.value.special === 'library' ? t('Find, filter and organize all your apps.')
    : !config.value.apps.length ? t('Choose the apps you want on your TV.')
    : !hasHomeSelection.value ? t('Add your favorite apps using their card actions.')
    : selectedSession.value ? t('Your app is still open.') : t('Your favorites, ready to open.'),
);
const heroStatus = computed(() =>
  current.value.catalog ? (youtubeDetected.value ? t('READY TO OPEN') : t('INSTALL')) : current.value.suggestion
    ? t('ADD')
    : selectedSession.value
      ? { running: t('RUNNING'), starting: t('STARTING…'), closing: t('CLOSING…'), untracked: t('LIMITED TRACKING') }[selectedSession.value.status]
      : current.value.entry?.target.kind === 'uri' ? t('WEB SHORTCUT') : '',
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
const movingSilo = computed(() => quickId.value === siloTile.id);
const quickCard = computed(() => movingSilo.value ? siloTile : quickApp.value);
function hasCardActions(tile?: Tile) {
  return !!tile && (!!tile.entry || tile.id === siloTile.id);
}
const quickSession = computed(() =>
  sessions.value.find((s) => s.appId === quickId.value),
);
const quickIndex = computed(() =>
  movingSilo.value
    ? homeTiles.value.findIndex(tile => tile.id === siloTile.id)
    : config.value.apps.findIndex(app => app.id === quickId.value),
);
const moveCount = computed(() => movingSilo.value ? homeTiles.value.length : config.value.apps.length);
const cardHold = new CardHold((holding) => (holdingCard.value = holding));
const cancelHold = () => cardHold.cancel();
function beginAccept(source: string) {
  if (keyboardTarget.value) {
    screenKeyboard.value?.handle("accept");
    return;
  }
  if (source !== "keyboard" && isTextControl(document.activeElement)) {
    openKeyboard(document.activeElement);
    return;
  }
  document.documentElement.dataset.inputMode = "directional";
  if (
    !panel.value &&
    !working.value &&
    hasCardActions(current.value) &&
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
  if (remoteBindingFor(e)) return;
  if (e.key === "Enter") releaseAccept("keyboard");
}
function visibilityChanged() {
  if (document.hidden) { cancelHold(); void flushSelectionSave(); }
}
async function openQuick(index: number) {
  if (panel.value || working.value || !hasCardActions(tiles.value[index])) return;
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
async function openQuickApp() {
  const tile = movingSilo.value ? siloTile : quickApp.value && appTile(quickApp.value);
  if (!tile) return;
  await closePanel();
  await activate(tile);
}
function removeQuick() {
  if (!quickApp.value) return;
  editing.value = JSON.parse(JSON.stringify(quickApp.value));
  confirm(
    t('Remove this card?'),
    t('The app will remain installed on your PC.'),
    t('Remove'),
    removeApp,
  );
}
async function moveQuick(delta: number) {
  if (movingSilo.value) {
    const position = quickIndex.value + delta;
    if (position < 0 || position >= moveCount.value) return;
    config.value.settings.library.siloHomePosition = position;
    await persist();
  } else await moveApp(quickIndex.value, delta);
  await nextTick();
  if (panel.value === "move" && panelRoot.value && (!panelRoot.value.contains(document.activeElement) || document.activeElement?.matches(":disabled")))
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
const resumeSession = (id: string) => run(t('Resuming'), () => api.resume(id));
function closeSession(id: string, dismissMenu = false) {
  const origin = panel.value;
  return run(t('Closing'), async () => {
    await api.closeApp(id);
    if (dismissMenu && panel.value === origin &&
        ((origin === "quick" && quickId.value === id) ||
         (origin === "session" && sessionPanelId.value === id))) await closePanel();
  });
}
const forceSession = (id: string, text = t('Unsaved data in this app may be lost.')) =>
  confirm(
    t('Force close?'),
    text,
    t('Force close'),
    async () => {
      if (sessions.value.some(session => session.appId === id && session.canForce))
        await api.closeApp(id, true);
    },
    id,
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
function queueSave(options: api.SaveOptions = {}, feedback = panel.value === 'settings') {
  // The preview's sound toggle writes only its own key; all other saves include the selection.
  if (native.value || !options.navigationSoundUpdate) {
    clearTimeout(selectionSaveTimer);
    selectionSaveTimer = undefined;
  }
  const request = ++saveRequest;
  if (feedback) settingsSaveStatus.value = t('Saving…');
  const snapshot = JSON.parse(JSON.stringify(config.value));
  saveChain = saveChain.then(async () => {
    try {
      await api.save(snapshot, options);
      lastSaved = snapshot;
      if (feedback && request === saveRequest) settingsSaveStatus.value = t('Saved');
      return true;
    } catch (e) {
      if (JSON.stringify(config.value) === JSON.stringify(snapshot))
        config.value = JSON.parse(JSON.stringify(lastSaved));
      if (feedback && request === saveRequest) settingsSaveStatus.value = t('Save failed');
      notify(e);
      return false;
    }
  });
  return saveChain;
}

function flushSelectionSave() {
  if (selectionSaveTimer !== undefined) return queueSave({}, false);
  return saveChain;
}
async function quitLauncher() {
  await flushSelectionSave();
  await api.quit();
}
function selectionChanged() {
  const id = current.value.entry?.id;
  // Utility cards must not erase the last application to restore on startup.
  if (!id || id === config.value.selectedId) return;
  config.value.selectedId = id;
  clearTimeout(selectionSaveTimer);
  selectionSaveTimer = setTimeout(flushSelectionSave, 350);
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
  if (card) scrollCardIntoView(card);
}
function scrollCardIntoView(card: Element) {
  card.scrollIntoView({
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
  if (p === 'settings') { settingsMenu.value?.focusRail(); return; }
  if (p === 'add') { appPicker.value?.focusInitial(); return; }
  if (panelRoot.value)
    focusElement(
      p === 'repair' ? panelRoot.value.querySelector<HTMLElement>('.repair-location .primary-button') ?? undefined : p === "confirm"
        ? (panelRoot.value.querySelector<HTMLElement>(
            ".confirm-actions button",
          ) ?? undefined)
        : p === "quick" || p === "move"
          ? (panelRoot.value.querySelector<HTMLElement>(
              ".quick-actions button:not(:disabled)",
            ) ?? undefined)
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
  if (panel.value === "session" && !panelSession.value) return closePanel();
  if (["quick", "move"].includes(panel.value) && !quickCard.value)
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
  choiceTarget.value = null;
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
  forceAppId: string | null = null,
) {
  forceTarget.value = forceAppId;
  confirmTitle.value = title;
  confirmText.value = text;
  confirmLabel.value = label;
  confirmAction = action;
  void openPanel("confirm");
}
async function acceptConfirm() {
  await run(confirmLabel.value, async () => {
    const action = confirmAction;
    await action();
    if (panel.value === "confirm" && confirmAction === action) await closePanel();
  });
}
async function activate(tile = current.value, youtubeChecked = false) {
  if (tile.id === siloTile.id) {
    siloAddress.value = localStorage.getItem(siloKey) ?? '';
    await openSilo();
    return;
  }
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
    await run(t('Return to Windows'), api.desktop);
    return;
  }
  if (tile.suggestion) {
    void openAdd(tile.name);
    return;
  }
  const session = sessions.value.find((s) => s.appId === tile.id);
  if (session) {
    if (session.status === "running") await resumeSession(tile.id);
    else {
      sessionPanelId.value = session.appId;
      void openPanel("session");
    }
    return;
  }
  await run(t('Launching'), async () => {
    config.value.selectedId = tile.id;
    if (!(await persist())) return;
    let session: Session;
    try { session = await api.launch(tile.id); }
    catch (e) {
      if (String(e) !== 'Application file not found.' || !tile.entry) throw e;
      await startRepair(tile.entry);
      return;
    }
    sessions.value = [
      ...sessions.value.filter((s) => s.appId !== session.appId),
      session,
    ];
  });
}
function dispatch(action: Action) {
  if (remoteCapturing.value && action !== "home") return;
  if (choiceTarget.value && action !== 'home') {
    settingChoice.value?.handle(action === 'accept-down' ? 'accept' : action);
    return;
  }
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
  if (panel.value === 'add' && appPicker.value?.navigate(action)) return;
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
  // Sliders use the horizontal axis; the vertical axis always leaves the row.
  if (panel.value && element instanceof HTMLInputElement && element.type === 'range') {
    editingControl.value = null;
    if (action === 'left' || action === 'right') {
      action === 'left' ? element.stepDown() : element.stepUp();
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    if (action === 'accept') return;
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
      if (panel.value === 'settings') backSettings();
      else void closePanel();
      return;
    }
    if (action === "accept") {
      if (!panelRoot.value?.contains(element) || element.matches(":disabled"))
        return;
      if (element instanceof HTMLSelectElement) choiceTarget.value = element;
      else if (isTextControl(element)) editingControl.value = element;
      else element.click();
      return;
    }
    if (panelRoot.value && ["up", "down", "left", "right"].includes(action)) {
      if (panel.value === 'settings') settingsMenu.value?.navigate(action);
      else focusDirection(panelRoot.value, action);
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
  if (view.value === 'carousel' && action === 'down') { showLibrary(); return; }
  if (view.value === 'grid' && action === 'up' && selected.value < columns.value && filterBar.value) {
    focusLibraryFilter();
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
  if (panel.value === 'settings' && !choiceTarget.value && (e.metaKey || e.ctrlKey) && e.code === 'KeyF') {
    e.preventDefault();
    void settingsMenu.value?.openSearch();
    return;
  }
  // Text and native select editing keep their physical keyboard behavior.
  const remoteTarget = e.target as HTMLElement;
  if (!isTextControl(remoteTarget) && remoteTarget.tagName !== 'SELECT'
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
      t('Quit Canapey?'),
      t('Your apps will stay open.'),
      t('Quit'),
      quitLauncher,
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
  // Let the browser validate and submit single-line forms, including TV PIN entry.
  if (target instanceof HTMLInputElement && text && target.form && e.key === "Enter") {
    if (e.repeat) e.preventDefault();
    return;
  }
  if (text && editingControl.value === target) {
    // Backspace deletes text here; it never navigates back while typing.
    if (e.key !== "Escape" && e.key !== "Enter" && e.key !== "F1") return;
    if (
      e.key === "Enter" &&
      e.shiftKey &&
      target instanceof HTMLTextAreaElement
    )
      return;
  } else if (text && (e.key.length === 1 || e.key === "Backspace" || e.key === "Delete")) {
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
  linkedFrom.value = null;
  settingsIndex.value = true;
  settingsRoute.value = isSettingsPage(lastSettingsPage.value) ? lastSettingsPage.value : 'display';
  void openPanel("settings");
  try {
    monitorList.value = await api.monitors();
  } catch (e) {
    notify(e);
  }
}
async function addEntries(entries: AppEntry[]) {
  const keys = new Set(config.value.apps.map((a) => targetKey(a.target)));
  const ids = new Set(config.value.apps.map(app => app.id));
  const fresh: AppEntry[] = [];
  for (const entry of entries) {
    const key = targetKey(entry.target);
    if (keys.has(key)) continue;
    const app = ids.has(entry.id) ? { ...entry, id: crypto.randomUUID() } : entry;
    keys.add(key);
    ids.add(app.id);
    fresh.push(app);
  }
  const origin = appPicker.value;
  const originPanel = panel.value;
  config.value.apps.push(...fresh);
  if (fresh[0]) config.value.selectedId = fresh[0].id;
  if (!(await persist())) return false;
  if (originPanel !== panel.value || origin !== appPicker.value) return true;
  resetLibrary();
  view.value = "grid";
  await nextTick();
  selected.value = reconcileSelection(tiles.value.map(tile => tile.id), fresh[0]?.id ?? null);
  dismissPanels();
  await focusCard();
  notify(
    fresh.length
      ? (fresh.length === 1 ? t('1 app added.') : t('{0} apps added.', [fresh.length]))
      : t('Already in your library.'),
  );
  return true;
}
const repairId = ref('');
const replacement = ref<AppEntry | null>(null);
const repairApp = computed(() => config.value.apps.find(app => app.id === repairId.value));
const repairOptions = ref<AppEntry[]>([]);
const repairSearched = ref(false);
function startRepair(app: AppEntry) {
  repairId.value = app.id;
  replacement.value = null;
  repairOptions.value = [];
  repairSearched.value = false;
  return openPanel('repair');
}
async function findReplacement() {
  const original = repairApp.value;
  if (!original) return;
  await run(t('Finding application…'), async () => {
    const file = (app: AppEntry) => app.target.value.split(/[\\/]/).at(-1)?.toLowerCase();
    const candidates = await api.scan();
    if (panel.value !== 'repair' || original.id !== repairId.value) return;
    repairOptions.value = candidates.filter(app =>
      ['executable', 'shortcut'].includes(app.target.kind) &&
      app.target.value.toLowerCase() !== original.target.value.toLowerCase() &&
      (file(original) === file(app) || app.name.toLowerCase() === original.name.toLowerCase()));
    repairSearched.value = true;
    await nextTick();
    panelRoot.value?.querySelector<HTMLElement>('[data-repair-candidate], [data-repair-browse]')?.focus();
  });
}
async function chooseReplacement(candidate?: AppEntry) {
  await run(t('Choosing an app'), async () => {
    const chosen = candidate ?? await api.pickTarget();
    if (chosen && panel.value === 'repair') {
      replacement.value = chosen;
      await nextTick();
      panelRoot.value?.querySelector<HTMLElement>('[data-repair-save]')?.focus();
    }
  });
}
async function saveReplacement() {
  const app = repairApp.value, candidate = replacement.value;
  if (!app || !candidate) return;
  await run(t('Saving…'), async () => {
    const target = { ...candidate.target, args: app.target.args.length ? [...app.target.args] : [...candidate.target.args] };
    await api.checkReplacement(target);
    if (config.value.apps.some(other => other.id !== app.id && targetKey(other.target) === targetKey(target)))
      throw new Error(t('This app is already in your library.'));
    if (panel.value !== 'repair' || repairApp.value !== app) return;
    app.target = target;
    if (await persist()) {
      await closePanel();
      notify(t('Application location updated.'));
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
    notify(t('Enter a name.'));
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
  if (changingSort) notify(t('Custom order enabled.'));
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
    throw new Error(t('The removal was not saved.'));
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
    if (!(await persist())) throw new Error(t('Restore was not saved. Try again.'));
    removedApp.value = null;
    if (!panel.value) { resetLibrary(); view.value = 'grid'; }
    await nextTick();
    selected.value = reconcileSelection(tiles.value.map(tile => tile.id), id);
    await focusAfterRemovalNotice();
    notify(t('Card restored with its favorites and category.'));
  } catch (error) {
    restoreError.value = error instanceof Error ? error.message : String(error);
  } finally { restoreBusy.value = false; }
}
async function imagePick(kind: "card" | "background") {
  await run(t('Choosing artwork'), async () => {
    const path = await api.pickImage(kind);
    if (path && editing.value) editing.value[kind] = path;
  });
}
let pendingUpdateCheck: Promise<UpdateInfo> | null = null;
function fetchUpdate() {
  pendingUpdateCheck ??= api.checkUpdate().finally(() => { pendingUpdateCheck = null; });
  return pendingUpdateCheck;
}
async function checkUpdates() {
  if (working.value) return;
  clearTimeout(updateTimer);
  update.value = null;
  updateError.value = "";
  await run(t('Checking for updates'), async () => {
    try {
      update.value = await fetchUpdate();
    } catch (e) {
      updateError.value = e instanceof Error ? e.message : String(e);
    }
  });
}
function requestUpdateInstall() {
  const names = appsToClose.value.map(session => session.name);
  confirm(
    t('Install the update?'),
    names.length
      ? t('Canapey will request a normal close for {0}, then install the update and restart. Confirm any save prompts in those apps.', [names.join(', ')])
      : t('Canapey will install the update and restart. Your settings and artwork will be preserved.'),
    names.length ? t('Close apps and install') : t('Download and install'),
    async () => {
      installingUpdate.value = true;
      updateError.value = '';
      updateStatus.value = names.length ? t('Closing apps…') : t('Preparing the update…');
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
watch([panel, settingsRoute, showControllerTest], () => {
  if (panel.value !== "settings" || settingsRoute.value !== "controls" || !showControllerTest.value)
    leaveControllerTest();
});
watch(() => panel.value === 'confirm' && forceTarget.value !== null &&
  !sessions.value.some(session => session.appId === forceTarget.value && session.canForce), invalid => {
  if (invalid) void closePanel();
});
watch(panelSession, (session) => {
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
watch([width, height, () => config.value.settings.scale], () => {
  const focused = document.activeElement;
  if (focused && cardsRoot.value?.contains(focused)) scrollCardIntoView(focused);
}, { flush: 'post' });
watch(lastSettingsPage, () => {
  if (!loaded.value) return;
  config.value.settings.lastSettingsTab = lastSettingsPage.value;
  settingsSaveStatus.value = '';
  void queueSave({}, false);
});
watch(() => tiles.value.map(tile => tile.id), (ids, previous) => {
  const id = loaded.value ? previous?.[selected.value] : config.value.selectedId;
  selected.value = reconcileSelection(ids, id ?? config.value.selectedId);
  if (!panel.value && cardsFocused.value) void focusCard();
}, { flush: 'pre' });
onMounted(async () => {
  document.addEventListener("keydown", keyboard);
  document.addEventListener("keyup", keyboardUp);
  window.addEventListener("pagehide", flushSelectionSave);
  window.addEventListener("blur", cancelHold);
  document.addEventListener("visibilitychange", visibilityChanged);
  document.addEventListener("pointerdown", pointerInput);
  document.addEventListener("focusin", focusChanged);
  resizeObserver = new ResizeObserver(() => {
    width.value = window.innerWidth;
    height.value = window.innerHeight;
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
    lastSettingsPage.value = isSettingsPage(b.config.settings.lastSettingsTab) ? b.config.settings.lastSettingsTab : 'display';
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
      siloUnavailable: () => { void configureSilo(t('Could not open your Silo server.')); },
      navigationSound: enabled => {
        config.value.settings.sound = enabled;
        lastSaved.settings.sound = enabled;
      },
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
        const root = panel.value === 'settings' && settingsRoute.value === 'diagnostic'
          ? panelRoot.value : null;
        const bookmark = root ? rememberFocus(root) : null;
        sessions.value = v;
        await nextTick();
        if (root && bookmark && root === panelRoot.value &&
            panel.value === 'settings' && settingsRoute.value === 'diagnostic' &&
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
        update.value = await fetchUpdate();
        if (update.value.state === "available")
          notify(
            t('Canapey {0} is available in Settings.', [update.value.version]),
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
  void flushSelectionSave();
  window.removeEventListener("pagehide", flushSelectionSave);
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
    <header class="topbar" :inert="!!panel || !!keyboardTarget || !!choiceTarget">
      <div class="brand">
        <img class="brand-mark" src="/brand/canapey-mark.svg" width="31" height="31" alt="" /><span
          >canapey<span class="brand-dot">.</span></span
        >
      </div>
      <nav :aria-label="t('Main navigation')">
        <button
          :class="{ active: view === 'carousel' }"
          @click="
            view = 'carousel';
            focusCard();
          "
        > {{ t('Home') }}</button
        ><button
          :class="{ active: view === 'grid' }"
          @click="
            showLibrary();
          "
        > {{ t('Library') }} </button>
      </nav>
      <div class="top-right">
        <button
          class="icon-button audio-trigger"
          :class="{ 'is-muted': audioState?.muted }"
          :title="t('Quick controls · {0}', [volumeDescription])"
          :aria-label="t('Quick controls')"
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
          :aria-label="t('Settings')"
          @click="openSettings"
        >
          <Icon name="settings" :size="22" />
        </button>
        <button
          class="icon-button power-button"
          :aria-label="t('Power')"
          :title="t('Power')"
          aria-haspopup="dialog"
          @click="openPanel('power')"
        >
          <Icon name="power" :size="21" />
        </button>
      </div>
    </header>
    <section
      v-if="view === 'carousel'"
      :inert="!!panel || !!keyboardTarget || !!choiceTarget"
      class="hero"
      :class="{ 'hero-initial': !animateHero }"
      aria-live="polite"
    >
      <div v-if="heroStatus" class="eyebrow">
        <span class="tiny-line" />{{ heroStatus }}
      </div>
      <h1 :key="heroTitle">{{ heroTitle }}</h1>
      <p v-if="subtitle">{{ subtitle }}</p>
    </section>
    <section
      class="library"
      :inert="!!panel || !!keyboardTarget || !!choiceTarget"
      :class="view"
      :aria-label="t('Apps')"
    >
      <RemovalNotice v-if="removedApp" class="library-removal" :name="removedApp.app.name" :busy="restoreBusy" :error="restoreError" @restore="restoreRemovedApp" @dismiss="dismissRemoval" />
      <div class="library-heading">
        <div>
          <span class="section-label">{{
            empty
              ? t('Suggested apps')
              : view === "grid"
                ? t('Your library')
                : hasHomeSelection ? t('Running and favorites') : t('Get started')
          }}</span>
          <span v-if="!empty" class="section-count" role="status">{{
            t('{0} app{1}{2}', [tiles.filter(tile => !tile.special).length, tiles.filter(tile => !tile.special).length !== 1 ? "s" : "", view === 'grid' && libraryFiltered ? t(' of {0}', [libraryCards.length]) : ''])
          }}</span>
        </div>
        <button v-if="view === 'grid'" class="small-button" @click="openAdd()"><Icon name="plus" :size="20" />{{ t('Add') }}</button>
      </div>
      <div v-if="view === 'grid' && !empty" class="library-tools">
        <label class="library-sort">{{ t('Sort') }}<select v-model="config.settings.library.sort" @change="persist"><option value="custom">{{ t('My order') }}</option><option value="name">{{ t('Name A–Z') }}</option><option value="category">{{ t('Category') }}</option></select></label>
        <div ref="filterBar" class="library-filters" role="group" :aria-label="t('Filter the library')"><button v-for="(label, key) in libraryFilters" :key="key" :aria-label="label" :aria-description="t('{0} app{1}', [libraryGroups[key].length, libraryGroups[key].length === 1 ? '' : 's'])" :aria-pressed="libraryFilter === key" @click="libraryFilter = key">{{ label }} <span aria-hidden="true">{{ libraryGroups[key].length }}</span></button><button v-if="libraryFiltered && tiles.length" class="reset-filters" @click="resetLibrary">{{ t('Clear filters') }}</button></div>
      </div>
      <div v-if="view === 'grid' && !empty && !tiles.length" class="library-empty"><h2>{{ t('No apps found') }}</h2><p>{{ libraryFilter === 'favorites' && !config.settings.library.favorites.length ? t('Add favorites from a card’s Actions menu.') : t('No apps in {0}. Change a card’s category from its actions.', [libraryFilters[libraryFilter]]) }}</p><button class="small-button" @click="resetLibrary">{{ t('Clear filters') }}</button></div>
      <div
        ref="cardsRoot"
        class="cards"
        :class="view"
        role="group"
        :aria-label="t('Choose an app')"
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
          :suggestion-label="tile.catalog ? (youtubeDetected ? t('Available') : t('Install')) : undefined"
          :image="tileImage(tile)"
          :eager="i < (view === 'grid' ? columns * 3 : 6)"
          :icon="api.imageUrl(tile.entry?.icon)"
          :target="tile.entry?.target"
          :selected="selected === i"
          :holding="selected === i && holdingCard"
          :has-options="hasCardActions(tile)"
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
    <footer class="bottom-bar" :inert="!!panel || !!keyboardTarget || !!choiceTarget">
      <div class="hints" :data-controller-family="inputLabels.family">
        <span class="controller-status" role="img" :aria-label="inputLabels.device" :title="controller ?? t('Keyboard navigation')">
          <Icon :name="controller ? 'controller' : 'keyboard'" :size="22" /><i v-if="controller" />
        </span>
        <span
          ><kbd :class="{ 'pad-key': controller }">{{ inputLabels.accept }}</kbd
          >OK</span
        ><span
          ><kbd :class="{ 'pad-key': controller }">{{ inputLabels.back }}</kbd
          >{{ t('Back') }}</span
        ><span
          ><kbd>{{ inputLabels.menu }}</kbd
          >{{ t('Settings') }}</span
        >
      </div>
      <span v-if="hasCardActions(current)" class="quick-hint"
        >{{ t('Hold') }} {{ inputLabels.acceptName }} ·
        Actions</span
      >
      <span v-if="!native" class="preview-badge"
        >{{ t('UI preview · Windows features unavailable') }}</span
      ><span v-else class="footer-date">{{ date }}</span>
    </footer>
    <div v-if="working && !checkingUpdates" class="busy-pill" role="status">
      <span class="spinner" />{{ working }}
    </div>
    <Transition name="toast"
      ><div v-if="toast" :inert="!!panel || !!keyboardTarget || !!choiceTarget" class="toast-message" role="status">
        <Icon name="info" :size="20" /><span>{{ toast }}</span
        ><button
          class="icon-button"
          :aria-label="t('Dismiss message')"
          @click="toast = ''"
        >
          <Icon name="close" :size="18" />
        </button></div
    ></Transition>
    <Transition name="panel">
      <div
        v-if="panel"
        :inert="!!keyboardTarget || !!choiceTarget"
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
            compact: ['power', 'confirm', 'session', 'repair', 'silo'].includes(panel),
            'audio-panel': panel === 'audio',
            'settings-panel': panel === 'settings',
            'picker-panel': panel === 'add',
            'controller-test-active': controllerTesting,
            'quick-panel': panel === 'quick' || panel === 'move',
          }"
          :style="
            panel === 'quick' || panel === 'move' ? quickPosition : undefined
          "
          role="dialog"
          aria-modal="true"
          :aria-label="
            panel === 'silo' ? 'Silo' : panel === 'repair' ? t('Locate application') : panel === 'youtube' ? 'YouTube' : panel === 'audio'
              ? t('Quick controls')
              : panel === 'quick'
                ? t('Actions for {0}', [quickCard?.name])
                : panel === 'move'
                  ? t('Move card')
                  : panel === 'settings'
                    ? t('Settings')
                    : panel === 'add'
                      ? t('Add apps')
                      : panel === 'edit'
                        ? t('Customize an app')
                        : panel === 'power'
                          ? t('Power')
                          : panel === 'session'
                            ? t('Running app')
                            : confirmTitle
          "
          @keydown.tab="trapFocus"
        >
          <div v-if="panel !== 'settings' && panel !== 'add'" class="panel-heading">
            <div class="panel-identity">
              <img v-if="(panel === 'quick' || panel === 'move') && quickCard"
                class="quick-app-art" :src="api.imageUrl(quickApp?.card) || `/art/${quickCard.theme}-card.webp`" alt="" />
              <div class="panel-title">
              <span class="eyebrow">{{ panel === 'quick' || panel === 'move' ? 'APPLICATION' : 'CANAPEY' }}</span>
              <h2>
                {{
                  panel === 'silo' ? 'Silo' : panel === 'repair' ? t('Locate application') : panel === 'youtube' ? 'YouTube' : panel === "audio"
                    ? t('Quick controls')
                    : panel === "quick"
                      ? quickCard?.name
                      : panel === "move"
                        ? t('Move card')
                        : panel === "edit"
                              ? t('Customize')
                              : panel === "power"
                                ? t('Power')
                                : panel === "session"
                                  ? panelSession?.name
                                  : confirmTitle
                }}
              </h2>
              <span v-if="panel === 'quick' && quickSession" class="quick-session-status">
                <i />{{ { starting: t('Starting…'), running: t('Running'), closing: t('Closing…'), untracked: t('Limited tracking') }[quickSession.status] }}
              </span>
              </div>
            </div>
            <button class="icon-button" :aria-label="t('Close')" :disabled="installingUpdate || youtubeBusy" @click="closePanel">
              <Icon name="close" />
            </button>
          </div>
          <form v-if="panel === 'silo'" class="silo-setup" @submit.prevent="openSilo">
            <p v-if="siloError" role="alert">{{ siloError }}</p>
            <template v-if="siloEditing">
              <label for="silo-server">{{ t('Silo server address') }}</label>
              <div class="silo-address">
                <input id="silo-server" v-model="siloAddress" data-silo-primary type="text" inputmode="url" placeholder="https://silo.example.org" autocomplete="off" spellcheck="false" />
                <button type="button" class="icon-button" :aria-label="t('On-screen keyboard')" @click="keyboardFor('#silo-server')"><Icon name="keyboard" /></button>
              </div>
              <button class="primary-button" type="submit">{{ t('Open Silo') }}</button>
            </template>
            <template v-else>
              <button class="primary-button" data-silo-primary type="submit">{{ t('Retry') }}</button>
              <button type="button" class="small-button" @click="configureSilo()">{{ t('Change server address') }}</button>
            </template>
            <button type="button" class="small-button" @click="closePanel">{{ t('Return to Canapey') }}</button>
          </form>
          <YouTubeSetup v-else-if="panel === 'youtube'" :native="native" :save-app="saveYouTube" :open-app="openYouTube" @busy="youtubeBusy = $event" @detected="youtubeDetected = $event" />
          <div v-else-if="panel === 'repair' && repairApp" class="repair-location">
            <h3>{{ repairApp.name }}</h3>
            <dl><dt>{{ t('Saved location') }}</dt><dd>{{ repairApp.target.value }}</dd>
              <template v-if="replacement"><dt>{{ t('New location') }}</dt><dd>{{ replacement.target.value }}</dd></template>
            </dl>
            <p v-if="repairSearched && !repairOptions.length" role="status">{{ t('No matching application found. Choose its file instead.') }}</p>
            <button v-if="replacement" class="primary-button" data-repair-save @click="saveReplacement">{{ t('Use this location') }}</button>
            <template v-else>
              <button class="primary-button" @click="findReplacement">{{ t('Find application') }}</button>
              <button v-for="app in repairOptions" :key="app.id" class="small-button" data-repair-candidate @click="chooseReplacement(app)">{{ app.target.value }}</button>
            </template>
            <button class="small-button" data-repair-browse @click="chooseReplacement()">{{ t('Choose a file…') }}</button>
            <button class="text-button" @click="closePanel">{{ t('Cancel') }}</button>
          </div>
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
          <template v-else-if="panel === 'quick' && quickCard">
            <div class="quick-actions power-options">
              <button v-if="!quickSession" @click="openQuickApp"><Icon name="play" /><span>{{ t('Open') }}</span></button>
              <template v-if="quickSession && quickApp">
                <button
                  :disabled="quickSession.status === 'untracked'"
                  @click="resumeSession(quickApp.id)"
                >
                  <Icon name="play" /><span>{{ t('Resume') }}</span>
                </button>
                <button @click="closeSession(quickApp.id, true)">
                  <Icon name="close" /><span>{{
                    quickSession.status === "untracked"
                      ? t('Stop tracking')
                      : t('Close normally')
                  }}</span>
                </button>
                <button
                  v-if="quickSession.canForce"
                  class="danger"
                  @click="forceSession(quickApp.id)"
                >
                  <Icon name="power" /><span>{{ t('Force close') }}</span>
                </button>
              </template>
              <p v-if="quickSession?.status === 'untracked'" class="note"> {{ t('Shared or unidentified window: switch to it with Alt + Tab.') }} </p>
              <button v-if="quickApp" :aria-pressed="favorite(quickApp.id)" @click="toggleFavorite(quickApp.id)"><Icon name="home" /><span>{{ favorite(quickApp.id) ? t('Remove from favorites') : t('Add to favorites') }}</span></button>
              <button v-if="quickApp" class="action-group-start" @click="edit(quickApp)">
                <Icon name="edit" /><span>{{ t('Edit') }}</span>
              </button>
              <button v-if="quickApp && native && !quickSession && ['executable', 'shortcut'].includes(quickApp.target.kind)" @click="startRepair(quickApp)">
                <Icon name="search" /><span>{{ t('Locate application') }}</span>
              </button>
              <button @click="openPanel('move')">
                <Icon name="right" /><span>{{ movingSilo ? t('Move on Home') : t('Move') }}</span>
              </button>
              <button v-if="movingSilo" @click="editSiloAddress">
                <Icon name="edit" /><span>{{ t('Change server address') }}</span>
              </button>
              <button v-if="quickApp" class="danger action-remove" @click="removeQuick">
                <Icon name="trash" /><span>{{ t('Remove card') }}</span>
              </button>
            </div>
          </template>
          <template v-else-if="panel === 'move' && quickCard">
            <p class="panel-intro">
              {{ quickCard.name }} · Position {{ quickIndex + 1 }} {{ t('of') }} {{ moveCount }}
            </p>
            <p v-if="!movingSilo" class="note">{{ t('Moving a card switches sorting to “My order”.') }}</p>
            <div class="quick-actions power-options">
              <button :disabled="quickIndex <= 0" @click="moveQuick(-1)">
                <Icon name="back" /><span>{{ t('Move earlier') }}</span>
              </button>
              <button
                :disabled="quickIndex >= moveCount - 1"
                @click="moveQuick(1)"
              >
                <Icon name="right" /><span>{{ t('Move later') }}</span>
              </button>
              <button data-move-done @click="closePanel">
                <Icon name="check" /><span>{{ t('Done') }}</span>
              </button>
            </div>
          </template>
          <template v-else-if="panel === 'settings'">
            <SettingsMenu ref="settingsMenu" :route="settingsRoute" :index="settingsIndex" :linked-from="linkedFrom" @browse="settingsIndex = true" @detail="settingsIndex = false" :save-status="settingsSaveStatus" @open="openSettingsRoute" @back="backSettings" @close="closePanel">
                <TvSettings v-if="settingsRoute === 'tv'" :native="native" :autostart="config.settings.autostart" @startup="openSettingsRoute('system', true)" />
                <AppleRemoteSettings v-if="settingsRoute === 'iphone'" :native="native" :settings="config.settings.appleRemote" :save-settings="saveAppleRemote" />
                <RemoteHomeSettings
                  v-if="settingsRoute === 'remote'"
                  :native="native"
                  :bindings="config.settings.remoteBindings ?? []"
                  :apps="config.apps"
                  :save-bindings="saveRemoteBindings"
                  @capturing="remoteCaptureChanged"
                >
                  <template #title><h3 id="remote-title">Skip 1s / Flirc</h3></template>
                </RemoteHomeSettings>
                <template v-if="settingsRoute === 'system'"
                  ><h3>{{ t('Startup and system') }}</h3>
                  <label class="setting-row"
                    ><span>{{ t('Start in full screen') }}</span
                    ><input
                      v-model="config.settings.fullscreen"
                      type="checkbox"
                      role="switch"
                      @change="persist" /></label
                  ><label class="setting-row"
                    ><span
                      >{{ t('Start with Windows') }}<small
                        >{{ t('When you sign in.') }}</small
                      ></span
                    ><input
                      v-model="config.settings.autostart"
                      :disabled="!native"
                      type="checkbox"
                      role="switch"
                      @change="persist" /></label
                  ></template>
                <template v-if="settingsRoute === 'display'">
                  <label class="display-preview">
                    <img :src="`/art/${config.settings.generalAmbiance}.webp`" alt="" />
                    <span class="display-caption">
                      <span class="display-label"><Icon name="monitor" :size="19" />{{ t('Preferred display') }}</span>
                      <strong>{{ preferredMonitor?.name ?? t('Primary display') }}</strong>
                      <small>{{ config.settings.monitor && !preferredMonitor ? t('Saved display unavailable') : t('Uses the primary display when the TV is unavailable.') }}</small>
                    </span>
                    <span class="display-change">{{ t('Change') }}<Icon name="down" :size="16" /></span>
                    <select v-model="config.settings.monitor" :aria-label="t('Preferred display')" @change="persist">
                      <option :value="null">{{ t('Primary display') }}</option>
                      <option v-if="config.settings.monitor && !preferredMonitor" :value="config.settings.monitor">{{ t('Saved display unavailable') }}</option>
                      <option v-for="m in monitorList" :key="m.id" :value="m.id">{{ m.name }}</option>
                    </select>
                  </label>
                  <div class="display-options">
                    <label class="setting-row">
                      <Icon name="grid" /><span>{{ t('Interface size') }}</span>
                      <input v-model.number="config.settings.scale" :aria-label="t('Interface size')" type="range" min="0.8" max="1.4" step="0.1" @change="persist" />
                      <output>{{ Math.round(config.settings.scale * 100) }}%</output>
                    </label>
                    <label class="setting-row">
                      <Icon name="globe" /><span>{{ t('Language') }}</span>
                      <select v-model="config.settings.locale" :aria-label="t('Language')" @change="setLocale(config.settings.locale as Locale); persist()">
                        <option v-for="language in languageOptions" :key="language.value" :value="language.value">{{ language.label }}</option>
                      </select>
                    </label>
                  </div>
                </template>
                <div v-if="settingsRoute === 'system'" class="system-actions"><button class="small-button" @click="run(t('Return to Windows'), api.desktop)"><Icon name="monitor" :size="20" />{{ t('Return to the Windows desktop') }}</button><button class="small-button" @click="openPanel('power')"><Icon name="power" :size="20" />{{ t('Power') }}</button></div>
                <template v-if="settingsRoute === 'apps'"
                  ><div class="content-heading">
                    <h3>{{ t('Your apps') }}</h3>
                    <button
                      class="small-button"
                      @click="
                        openAdd();
                      "
                    >
                      <Icon name="plus" :size="18" />{{ t('Add') }} </button>
                  </div>
                  <RemovalNotice v-if="removedApp" :name="removedApp.app.name" :busy="restoreBusy" :error="restoreError" @restore="restoreRemovedApp" @dismiss="dismissRemoval" />
                  <p class="note">{{ t('Favorites appear on Home. The arrows switch library sorting to “My order”.') }}</p>
                  <p v-if="!config.apps.length" class="muted"> {{ t('No apps added yet.') }} </p>
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
                            ? t('Web shortcut / URI')
                            : a.source
                        }}</small></span
                      ></button
                    ><button class="icon-button" :aria-label="t('{0} favorites: {1}', [favorite(a.id) ? t('Remove from') : t('Add to'), a.name])" :aria-pressed="favorite(a.id)" @click="toggleFavorite(a.id)"><Icon name="home" :size="20" /></button><button
                      class="icon-button"
                      :disabled="i === 0"
                      :aria-label="t('Move {0} earlier', [a.name])"
                      :data-focus-key="`${a.id}:up`"
                      @click="moveApp(i, -1)"
                    >
                      <Icon name="up" :size="18" /></button
                    ><button
                      class="icon-button"
                      :disabled="i === config.apps.length - 1"
                      :aria-label="t('Move {0} later', [a.name])"
                      :data-focus-key="`${a.id}:down`"
                      @click="moveApp(i, 1)"
                    >
                      <Icon name="down" :size="18" /></button
                    ><button
                      class="icon-button"
                      :aria-label="t('Edit {0}', [a.name])"
                      :data-focus-key="`${a.id}:edit`"
                      @click="edit(a)"
                    >
                      <Icon name="edit" :size="18" />
                    </button></div
                ></template>
                <template v-if="settingsRoute === 'controls'"
                  ><h3>{{ t('Controller and navigation') }}</h3>
                  <div class="device-line">
                    <Icon name="controller" :size="28" />
                    <div>
                      {{ controller ?? t('No controller connected')
                      }}<small
                        >{{ t('Xbox, PlayStation and Nintendo controllers recognized by Windows') }}</small
                      >
                    </div>
                  </div>
                  <label class="setting-row home-shortcut-row"
                    ><span
                      >{{ t('Global Home shortcut') }}<small
                        >{{ config.settings.returnShortcut === 'xbox'
                          ? t('Press Xbox once, or hold Start + Back as a fallback.')
                          : t('Hold the buttons without closing your app.') }}</small
                      ></span
                    ><select
                      v-model="config.settings.returnShortcut"
                      @change="persist"
                    >
                      <option value="xbox">{{ t('Xbox button') }}</option>
                      <option value="startBack">Start + Back</option>
                      <option value="shouldersStart">LB + RB + Start</option>
                      <option value="disabled">{{ t('Disabled') }}</option>
                    </select></label
                  ><label class="setting-row"
                    ><span
                      >{{ t('Shortcut hold duration') }}<small
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
                      >{{ t('Stick deadzone') }}<small
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
                  <button class="small-button" :aria-expanded="showControllerTest" @click="showControllerTest = !showControllerTest">{{ showControllerTest ? t('Hide controller test') : t('Test controller') }}</button>
                  <ControllerTester v-if="showControllerTest" :snapshot="controllerSnapshot" :controller-name="controller" :testing="controllerTesting" :native="native" :deadzone="config.settings.deadzone" @toggle="toggleControllerTest" @deadzone="setDeadzone" />
                  <button class="disclosure-button" :aria-expanded="controllerHelp" @click="controllerHelp = !controllerHelp">{{ t('Xbox / Steam Input troubleshooting') }}<Icon :name="controllerHelp ? 'up' : 'down'" :size="18" /></button>
                  <div v-if="controllerHelp"><XboxHomeSettings :native="native" /><p class="note"> {{ t('Steam Input may intercept these buttons. Disable its Desktop Layout or choose another combination.') }} </p></div></template>
                <template v-if="settingsRoute === 'ambience'">
                  <h3 class="settings-subheading">{{ t('Ambience') }}</h3>
                  <section class="selector-palette" aria-labelledby="selector-color-title">
                    <h4 id="selector-color-title">{{ t('Selector color') }}</h4>
                    <div class="selector-presets" role="group" aria-labelledby="selector-color-title">
                      <button v-for="(preset, id) in selectorColors" :key="id"
                        :aria-pressed="config.settings.selectorColor === id" @click="selectColor(id)">
                        <span class="selector-swatch" :style="{ backgroundColor: preset.color }" aria-hidden="true">
                          <Icon v-if="config.settings.selectorColor === id" name="check" :size="18" />
                        </span>
                        {{ t(preset.label) }}
                      </button>
                    </div>
                  </section>
                  <h4 class="ambience-section-title">{{ t('General ambiences') }}</h4>
                  <div class="ambiance-gallery" role="group" :aria-label="t('General ambiences')">
                    <button v-for="ambiance in generalAmbiances" :key="ambiance.id"
                      class="ambiance-choice" :aria-label="ambiance.name" :title="ambiance.description"
                      :aria-pressed="config.settings.generalAmbiance === ambiance.id"
                      @click="selectGeneralAmbiance(ambiance.id)">
                      <img :src="`/art/${ambiance.id}-card.webp`" alt="" loading="lazy" />
                      <span>{{ ambiance.name }}</span>
                      <Icon v-if="config.settings.generalAmbiance === ambiance.id" name="check" :size="18" />
                    </button>
                  </div>
                  <p class="ambiance-choice-hint">{{ t('Choose an ambience to use everywhere, or enable per-app backgrounds below.') }}</p>
                  <div class="ambiance-preview" :aria-label="t('Background preview')">
                    <img :src="heroBg" alt="" />
                    <span>{{ t('Preview background') }}</span>
                  </div>
                  <label class="setting-row">
                    <span>{{ t('Per-app background') }}<small>{{ t('Each app has its own atmosphere. Home keeps your general ambience.') }}</small></span>
                    <input v-model="config.settings.dynamicBackground" type="checkbox" role="switch" @change="persist" />
                  </label>
                  <label class="setting-row">
                    <span>{{ t('Background brightness') }}<small>{{ Math.round(config.settings.backgroundBrightness * 100) }} %</small></span>
                    <input v-model.number="config.settings.backgroundBrightness" type="range" min="0.3" max="1" step="0.05" @change="persist" />
                  </label>
                  <label class="setting-row">
                    <span>{{ t('Background blur') }}<small>{{ config.settings.backgroundBlur === 0 ? t('None') : config.settings.backgroundBlur + ' px' }}</small></span>
                    <input v-model.number="config.settings.backgroundBlur" type="range" min="0" max="12" step="1" @change="persist" />
                  </label>
                  <label class="setting-row"
                    ><span>{{ t('Animations') }}<small>{{ osReducedMotion ? t('Reduced according to your system preferences.') : t('Transitions between cards and backgrounds.') }}</small></span
                    ><input
                      v-model="config.settings.motion"
                      type="checkbox"
                      role="switch"
                      @change="persist" /></label
                  >
                </template>
                <template v-if="settingsRoute === 'sound'">
                  <label class="setting-row"
                    ><span>{{ t('Navigation sounds') }}</span
                    ><input
                      v-model="config.settings.sound"
                      type="checkbox"
                      role="switch"
                      @change="queueSave({ navigationSoundUpdate: true })"
                  /></label>
                  <label class="setting-row">
                    <span>{{ t('Sound volume') }}<small>{{ Math.round(config.settings.soundVolume * 100) }} {{ t('% · Canapey sounds only.') }}</small></span>
                    <input v-model.number="config.settings.soundVolume" :disabled="!config.settings.sound" type="range" min="0" max="1" step="0.05" @change="persist(); sound()" />
                  </label>
                  <button class="small-button ambiance-sound-test" :disabled="!config.settings.sound || config.settings.soundVolume === 0" @click="sound">{{ t('Preview sound') }}</button>
                </template>
                <template v-if="settingsRoute === 'updates'"
                  ><div class="version-art">
                    <img src="/brand/canapey-mark.svg" width="48" height="48" alt="" /><span>canapey.</span
                    ><small>Version {{ version }}</small>
                  </div>
                  <h3 aria-live="polite" aria-atomic="true">
                    {{
                      checkingUpdates
                        ? t('Checking for updates…')
                        : update?.state === "available"
                          ? t('Version {0} available', [update.version])
                          : update?.state === "current"
                            ? t('You’re up to date.')
                            : t('Updates')
                    }}
                  </h3>
                  <p v-if="update?.state === 'current'" class="muted"> {{ t('You’re using the latest available version of Canapey.') }} </p>
                  <p v-else class="muted"> {{ t('Canapey closes tracked apps before installing, then restarts. Your settings are preserved.') }} </p>
                  <p v-if="sessions.some(session => session.status === 'untracked')" class="note">{{ t('Shared or unidentified windows stay open.') }}</p>
                  <p v-if="update?.state === 'disabled'" class="note"> {{ t('Updates are not configured for this distribution yet.') }} </p>
                  <p v-if="updateError" class="inline-error">
                    {{ updateError }}
                  </p>
                  <div class="update-actions">
                  <button
                    class="primary-button"
                    :disabled="!!working"
                    @click="checkUpdates"
                  >
                    <Icon name="update" :size="18" />{{ t('Check for updates') }}</button
                  ><button
                    v-if="update?.state === 'available'"
                    class="small-button"
                    :disabled="!!working"
                    @click="requestUpdateInstall"
                  >
                    {{ appsToClose.length ? t('Close apps and install') : t('Download and install') }}
                  </button></div>
                  <ReleaseNotes v-if="update?.notes" :notes="update.notes" /></template
                >
                <template v-if="settingsRoute === 'diagnostic'"
                  ><h3>{{ t('Diagnostics') }}</h3>
                  <dl class="diagnostic">
                    <div>
                      <dt>{{ t('Version') }}</dt>
                      <dd>{{ version }}</dd>
                    </div>
                    <div>
                      <dt>{{ t('Platform') }}</dt>
                      <dd>
                        {{
                          native ? "Windows 11 x64" : t('UI preview')
                        }}
                      </dd>
                    </div>
                    <div>
                      <dt>{{ t('Tracked apps') }}</dt>
                      <dd>{{ sessions.length }}</dd>
                    </div>
                    <div>
                      <dt>{{ t('Controller') }}</dt>
                      <dd>{{ controller ?? t('Not connected') }}</dd>
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
                    > {{ t('Resume') }}</button
                    ><button
                      class="small-button"
                      @click="closeSession(session.appId)"
                    >
                      {{
                        session.status === "untracked"
                          ? t('Stop tracking')
                          : t('Close')
                      }}</button
                    ><button
                      v-if="session.canForce"
                      class="small-button danger"
                      @click="forceSession(session.appId)"
                    > {{ t('Force close') }} </button>
                  </div>
                  <button
                    class="small-button"
                    @click="run(t('Opening logs'), api.logs)"
                  >
                    <Icon name="folder" :size="18" />{{ t('Open logs') }} </button>
                  <p class="note"> {{ t('Exit shortcut:') }} <b>{{ t('Ctrl + Shift + Q') }}</b>.<br />{{ t('Alt + F4 also closes Canapey.') }}<br />{{ t('Reopen it from the system tray icon or its shortcut.') }} </p>
                  <button
                    class="text-button danger"
                    @click="
                      confirm(
                        t('Quit Canapey?'),
                        t('Your apps will stay open.'),
                        t('Quit'),
                        quitLauncher,
                      )
                    "
                  > {{ t('Quit Canapey') }} </button></template
                >
            </SettingsMenu>
          </template>
          <AddApps v-else-if="panel === 'add'" ref="appPicker"
            :native="native" :initial-query="importQuery" :library="config.apps" :discovered="discoveredApps"
            :samples="examples.filter(tile => !tile.catalog)" :save="addEntries"
            @discovered="discoveredApps = $event" @keyboard="openKeyboard" @close="closePanel" />
          <template v-else-if="panel === 'edit' && editing">
            <div class="edit-layout">
              <div class="edit-preview">
                <AppCard
                  inert
                  :name="editing.name"
                  :theme="editing.theme"
                  :icon="api.imageUrl(editing.icon)"
                  :target="editing.target"
                  :image="
                    api.imageUrl(editing.card) ||
                    `/art/${editing.theme}-card.webp`
                  "
                  selected
                />
                <div class="image-actions">
                  <button class="small-button" @click="imagePick('card')"> {{ t('Card image') }}</button
                  ><button
                    class="small-button"
                    @click="imagePick('background')"
                  > {{ t('Background') }}</button
                  ><button
                    class="text-button"
                    @click="
                      editing.card = null;
                      editing.background = null;
                    "
                  > {{ t('Original artwork') }} </button>
                </div>
              </div>
              <div class="edit-fields">
                <label
                  >{{ t('Name') }}<input
                    v-model="editing.name" data-name-editor
                    :aria-label="t('Name')"
                    maxlength="100" /></label
                ><button
                  class="small-button"
                  :aria-label="t('Name keyboard')"
                  @click="keyboardFor('input[data-name-editor]')"
                > {{ t('Keyboard') }}</button
                ><label>{{ t('Category') }}<select v-model="editingCategory"><option value="auto">{{ t('Automatic ({0})', [categories[categoryFor(editing, { ...config.settings.library, categories: {} })]]) }}</option><option v-for="(label, key) in categories" :key="key" :value="key">{{ label }}</option></select></label><label
                  >{{ t('Ambience') }}<select v-model="editing.theme">
                    <option
                      v-for="theme in [
                        'home',
                        'netflix',
                        'youtube',
                        'spotify',
                        'internet',
                        'steam',
                        'plezy',
                        'silo',
                        'launchbox',
                      ]"
                      :key="theme"
                      :value="theme"
                    >
                      {{ theme === "home" ? t('General ambience') : theme === "silo" ? t('Silo · Streaming') : theme === "launchbox" ? t('LaunchBox · Arcade') : theme }}
                    </option>
                  </select></label
                ><label
                  >{{ t('Target') }}<input
                    v-model="editing.target.value"
                    spellcheck="false" /></label
                ><template
                  v-if="
                    ['executable', 'shortcut'].includes(editing.target.kind)
                  "
                  ><label
                    >{{ t('Arguments') }}<small
                      >{{ t('One argument per line, without extra quotation marks.') }}</small
                    ><textarea
                      v-model="argumentsText"
                      rows="3"
                      spellcheck="false"
                    /></label
                  ><label
                    >{{ t('Working directory') }}<input
                      v-model="editing.target.workingDir"
                      spellcheck="false" /></label
                ></template>
                <div class="edit-footer">
                  <button
                    v-if="config.apps.some((a) => a.id === editing?.id)"
                    class="text-button danger"
                    @click="
                      confirm(
                        t('Remove this card?'),
                        t('The app will remain installed on your PC.'),
                        t('Remove'),
                        removeApp,
                      )
                    "
                  >
                    <Icon name="trash" :size="18" />{{ t('Remove') }}</button
                  ><button class="primary-button" @click="saveEditing"> {{ t('Save') }}<Icon name="check" :size="18" />
                  </button>
                </div>
              </div>
            </div>
          </template>
          <template v-else-if="panel === 'power'"
            ><div class="power-options">
              <button @click="run(t('Return to Windows'), api.desktop)"><Icon name="monitor" /><span>{{ t('Return to the Windows desktop') }}</span><Icon name="right" :size="18" /></button>
              <button
                @click="
                  confirm(
                    t('Put the PC to sleep?'),
                    t('Your session will be preserved.'),
                    t('Sleep'),
                    sleepPc,
                  )
                "
              >
                <Icon name="moon" /><span>{{ t('Sleep') }}</span
                ><Icon name="right" :size="18" /></button
              ><button
                @click="
                  confirm(
                    t('Restart the PC?'),
                    t('Save your work in open apps.'),
                    t('Restart'),
                    restartPc,
                  )
                "
              >
                <Icon name="restart" /><span>{{ t('Restart') }}</span
                ><Icon name="right" :size="18" /></button
              ><button
                @click="
                  confirm(
                    t('Shut down the PC?'),
                    t('Save your work in open apps.'),
                    t('Shut down'),
                    shutdownPc,
                  )
                "
              >
                <Icon name="power" /><span>{{ t('Shut down') }}</span
                ><Icon name="right" :size="18" />
              </button>
              <button
                @click="
                  confirm(
                    t('Quit Canapey?'),
                    t('Your apps will stay open.'),
                    t('Quit'),
                    quitLauncher,
                  )
                "
              >
                <Icon name="close" /><span>{{ t('Quit launcher') }}</span
                ><Icon name="right" :size="18" />
              </button></div
          ></template>
          <template v-else-if="panel === 'session' && panelSession"
            ><p class="panel-intro">
              {{
                panelSession.status === "untracked"
                  ? t('This launch uses a shared or unidentified window. Switch to it with Alt + Tab.')
                  : t('Your app is still open.')
              }}
            </p>
            <div class="power-options">
              <button
                :disabled="panelSession.status === 'untracked'"
                @click="resumeSession(panelSession.appId)"
              >
                <Icon name="play" /><span>{{ t('Resume') }}</span></button
              ><button @click="closeSession(panelSession.appId, true)">
                <Icon name="close" /><span>{{
                  panelSession.status === "untracked"
                    ? t('Stop tracking this launch')
                    : t('Close normally')
                }}</span></button
              ><button
                v-if="panelSession.canForce"
                class="danger"
                @click="
                  forceSession(panelSession.appId, t('Unsaved data in this app may be lost. Only processes launched and identified by Canapey will be stopped.'))
                "
              >
                <Icon name="power" /><span>{{ t('Force close') }}</span>
              </button>
            </div>
            <p v-if="panelSession.status === 'closing'" class="note"> {{ t('Close requested. If the app does not respond, a force-close option appears after 5 seconds.') }} </p></template
          >
          <template v-else-if="panel === 'confirm'"
            ><p class="confirm-copy">{{ confirmText }}</p>
            <p v-if="installingUpdate" class="update-progress" role="status">{{ updateStatus }}</p>
            <div class="confirm-actions">
              <button class="small-button" :disabled="installingUpdate" @click="closePanel">{{ t('Cancel') }}</button
              ><button
                class="primary-button"
                :disabled="!!working"
                @click="acceptConfirm"
              >
                {{ confirmLabel }}
              </button>
            </div></template
          >
          <div v-if="panel !== 'add'" class="panel-footer" aria-live="polite">
            <span v-if="controllerTesting"
              >{{ t('Hold') }} {{ inputLabels.backName }} {{ t('1.2 s: stop test · Esc on keyboard') }}</span
            >
            <template v-else
              ><span
                ><kbd :class="{ 'pad-key': controller }">{{ inputLabels.back }}</kbd
                >{{ t('Back') }}</span
              ><span v-if="editingControl">{{
                isTextControl(editingControl)
                  ? t('Typing · Enter to finish · Shift+Enter for a new line')
                  : t('Arrows to adjust · OK to finish')
              }}</span
              ><span v-else-if="panel === 'audio'"
                >{{ t('↑ ↓ Navigate · ← → Volume ·') }} {{ inputLabels.acceptName }} {{ t('Choose') }}</span
              ><span v-else-if="panel === 'settings'">{{ settingsIndex ? t('↑ ↓ Browse · {0} Open', [inputLabels.acceptName]) : t('↑ ↓ Navigate · ← → Adjust · {0} Choose', [inputLabels.acceptName]) }}</span><span v-else>{{
                controller
                  ? t('D-pad: navigate · {0}: OK', [inputLabels.acceptName])
                  : t('Arrows: navigate · Enter: OK / edit')
              }}</span></template
            >
          </div>
        </section>
      </div>
    </Transition>
    <SettingChoice v-if="choiceTarget" ref="settingChoice" :select="choiceTarget" @done="closeChoice" @cancel="closeChoice()" />
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
