<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import { t, locale } from '../lib/i18n';
import { appLogoCandidates } from '../lib/app-logo';
import { imageUrl, pickTarget, scan } from '../lib/bridge';
import { isSystemTool } from '../lib/discovery';
import { focusElement } from '../lib/navigation';
import { targetKey, type Action, type AppEntry, type Theme } from '../lib/types';
import Icon from './Icon.vue';

const props = defineProps<{
  native: boolean;
  library: AppEntry[];
  discovered: AppEntry[] | null;
  initialQuery: string;
  samples: { id: string; name: string; theme: Theme }[];
  save: (entries: AppEntry[]) => Promise<boolean>;
}>();
const emit = defineEmits<{ discovered: [apps: AppEntry[]]; close: []; keyboard: [input: HTMLInputElement] }>();
const query = ref(props.initialQuery), showTools = ref(false), optionsOpen = ref(false);
const manual = ref<AppEntry[]>([]), selected = ref(new Set<string>()), failedImages = ref(new Set<string>());
const loading = ref(false), saving = ref(false), browsing = ref(false);
const scanError = ref(''), actionError = ref('');
const field = ref<HTMLInputElement>(), list = ref<HTMLElement>(), more = ref<HTMLButtonElement>();
const confirmButton = ref<HTMLButtonElement>(), cancel = ref<HTMLButtonElement>();
let alive = true;
let lastRow: HTMLButtonElement | null = null;

// These illustrative cards live only in the browser preview. They never enter Windows discovery.
const samples = computed<AppEntry[]>(() => props.samples.map(({ id, name, theme }) => ({
  id: 'preview-' + id, name, theme, icon: null, card: null, background: null, source: t('Browser preview'),
  target: { kind: 'uri', value: 'canapey-preview:' + theme, workingDir: null, args: [] },
})));
const added = computed(() => new Set(props.library.map(app => targetKey(app.target))));
const apps = computed(() => {
  const entries = new Map<string, AppEntry>();
  for (const app of [...(props.native ? props.discovered ?? [] : samples.value), ...manual.value]) {
    entries.set(targetKey(app.target), app);
  }
  return [...entries].sort(([,a], [,b]) => a.name.localeCompare(b.name, locale.value, { numeric: true, sensitivity: 'base' }));
});
const duplicateNames = computed(() => {
  const seen = new Set<string>(), duplicates = new Set<string>();
  for (const [, app] of apps.value) {
    if (seen.has(app.name)) duplicates.add(app.name);
    seen.add(app.name);
  }
  return duplicates;
});
const fold = (value: string) => value.trim().normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase();
const visible = computed(() => {
  const term = fold(query.value);
  return apps.value.filter(([key, app]) =>
    (showTools.value || selected.value.has(key) || !isSystemTool(app)) &&
    (fold(app.name).includes(term) || (app.theme === 'launchbox' && term === 'launchbox')));
});
const choices = computed(() => apps.value.filter(([key]) => selected.value.has(key) && !added.value.has(key)).map(([,app]) => app));
const listSize = computed(() => Math.min(7, Math.max(3, apps.value.length)));
const hasTools = computed(() => apps.value.some(([, app]) => isSystemTool(app)));
function logo(app: AppEntry) {
  return [imageUrl(app.icon), ...appLogoCandidates(app.name, app.target)].find(src => src && !failedImages.value.has(src));
}
function toggle(key: string) {
  if (saving.value || added.value.has(key)) return;
  if (selected.value.has(key)) selected.value.delete(key);
  else selected.value.add(key);
  actionError.value = '';
}
function closeOptions() {
  if (!optionsOpen.value) return false;
  optionsOpen.value = false;
  nextTick(() => more.value?.focus());
  return true;
}
async function refresh() {
  if (loading.value || !props.native) return;
  closeOptions();
  loading.value = true;
  scanError.value = '';
  try {
    const entries = await scan();
    if (alive) emit('discovered', entries);
  } catch (error) {
    if (alive) scanError.value = error instanceof Error ? error.message : String(error);
  } finally {
    loading.value = false;
    await nextTick();
    if (alive && (document.activeElement === list.value || document.activeElement === document.body)) focusInitial();
  }
}
async function chooseFile() {
  if (browsing.value || !props.native) return;
  browsing.value = true;
  actionError.value = '';
  try {
    const app = await pickTarget();
    if (!app || !alive) return;
    const key = targetKey(app.target);
    if (added.value.has(key)) { actionError.value = t('Already in your library.'); return; }
    if (!manual.value.some(entry => targetKey(entry.target) === key)) manual.value.push(app);
    query.value = '';
    selected.value.add(key);
    await nextTick();
    focusElement(confirmButton.value);
  } catch (error) { if (alive) actionError.value = String(error); }
  finally { browsing.value = false; }
}
async function submit() {
  if (saving.value || !choices.value.length) return;
  if (props.library.length + choices.value.length > 250) {
    actionError.value = t('A library can hold 250 apps. Select fewer apps or remove an existing card.');
    return;
  }
  saving.value = true;
  actionError.value = '';
  try {
    if (!await props.save(choices.value)) actionError.value = t('Could not save your apps. Try again.');
  } finally {
    saving.value = false;
    if (alive) nextTick(() => confirmButton.value?.focus());
  }
}
function clearSearch() { query.value = ''; nextTick(() => field.value?.focus()); }
function rememberRow(event: FocusEvent) {
  if (event.currentTarget instanceof HTMLButtonElement) lastRow = event.currentTarget;
}
function rowButtons() { return Array.from(list.value?.querySelectorAll<HTMLButtonElement>('[data-app-row]:not(:disabled)') ?? []); }
function enterList() { focusElement(list.value?.querySelector<HTMLButtonElement>('button:not(:disabled)') ?? cancel.value); }
function focusInitial() {
  if (document.documentElement.dataset.inputMode === 'directional') {
    if (loading.value && !apps.value.length) focusElement(list.value);
    else if (rowButtons().length) enterList();
    else field.value?.focus();
  } else field.value?.focus();
}
function navigate(action: Action) {
  if (action === 'back' && closeOptions()) return true;
  if (action === 'back' && document.activeElement === field.value && query.value) {
    clearSearch();
    return true;
  }
  if (saving.value && action !== 'home') return true;
  const active = document.activeElement as HTMLElement;
  if (active.closest('.app-picker footer') && action === 'up' && lastRow?.isConnected && !lastRow.disabled) {
    focusElement(lastRow);
    return true;
  }
  if (active === field.value && action === 'down') { enterList(); return true; }
  if (!(active instanceof HTMLButtonElement) || !active.hasAttribute('data-app-row')) return false;
  if (action === 'right' && choices.value.length) { focusElement(confirmButton.value); return true; }
  if (action === 'up' || action === 'down') {
    const rows = rowButtons();
    const next = rows.indexOf(active) + (action === 'up' ? -1 : 1);
    focusElement(rows[next] ?? (next < 0 ? field.value : choices.value.length ? confirmButton.value : cancel.value));
    return true;
  }
  return false;
}
onMounted(() => { if (props.native && props.discovered === null) void refresh(); });
onUnmounted(() => { alive = false; });
defineExpose({ navigate, focusInitial });
</script>

<template>
  <div class="app-picker">
    <header>
      <h2>{{ t('Add apps') }}</h2>
      <p>{{ native ? t('Choose apps from this PC.') : t('Try sample apps in your browser library.') }}</p>
    </header>
    <div class="picker-tools">
      <div class="picker-search">
        <Icon name="search" :size="19" />
        <input ref="field" v-model="query" type="search" :aria-label="t('Search for an app')" :placeholder="t('Search apps')" autocomplete="off"
          @keydown.down.prevent.stop="enterList" />
        <button v-if="query" :aria-label="t('Clear search')" @click="clearSearch"><Icon name="close" :size="16" /></button>
        <button :aria-label="t('Search keyboard')" @click="field && emit('keyboard',field)"><Icon name="keyboard" :size="20" /></button>
      </div>
      <button v-if="native" ref="more" class="picker-more" :aria-label="t('Discovery options')" :title="t('Discovery options')"
        :aria-expanded="optionsOpen" aria-controls="picker-options" @click="optionsOpen = !optionsOpen"><Icon name="more" :size="21" /></button>
    </div>
    <div v-if="optionsOpen" id="picker-options" class="picker-options">
      <label v-if="hasTools"><input v-model="showTools" type="checkbox" />{{ t('Show system tools') }}</label>
      <button :disabled="loading" @click="refresh"><Icon name="refresh" :size="16" />{{ t('Refresh list') }}</button>
    </div>
    <div ref="list" class="picker-list" tabindex="-1" :style="{ '--picker-rows': listSize }" :aria-label="native ? t('Apps on this PC') : t('Sample apps')" role="group" :aria-busy="loading">
      <p v-if="loading" class="picker-message" role="status"><span class="spinner" />{{ t('Finding apps on this PC…') }}</p>
      <div v-if="scanError" class="picker-message" role="alert">
        <strong>{{ t('Couldn’t finish finding apps.') }}</strong>
        <small>{{ scanError }}</small><button @click="refresh">{{ t('Try again') }}</button>
      </div>
      <div v-if="!loading && !scanError && !visible.length" class="picker-message" role="status">
        <strong>{{ query.trim() ? t('No matches for “{0}”', [query.trim()]) : t('No apps found') }}</strong>
        <button v-if="query.trim()" @click="clearSearch">{{ t('Clear search') }}</button>
        <button v-else-if="hasTools && !showTools" @click="showTools = true">{{ t('Show system tools') }}</button>
        <small v-else-if="native">{{ t('Choose an application file to add it.') }}</small>
      </div>
      <button v-for="[key, app] in visible" :key="key" data-app-row :data-focus-key="key" class="picker-app"
        :disabled="added.has(key)" @focus="rememberRow" :aria-pressed="selected.has(key) || added.has(key)" @click="toggle(key)">
        <span class="picker-icon" :class="`theme-${app.theme}`"><img v-if="logo(app)" :src="logo(app)" alt=""
          @error="failedImages.add(($event.target as HTMLImageElement).getAttribute('src')!)" /><Icon v-else :name="app.theme === 'internet' ? 'globe' : app.theme === 'launchbox' ? 'controller' : 'grid'" /></span>
        <span class="picker-name">{{ app.name }}<small v-if="duplicateNames.has(app.name)">{{ [app.target.value, ...app.target.args].join(' ') }}</small></span>
        <small v-if="added.has(key)" class="picker-added">{{ t('In library') }}</small>
        <span class="picker-tick"><Icon v-if="selected.has(key) || added.has(key)" name="check" :size="15" /></span>
      </button>
    </div>
    <p v-if="actionError" class="picker-error" role="alert">{{ actionError }}</p>
    <footer>
      <button v-if="native" class="picker-file" :disabled="browsing || saving" @click="chooseFile"><Icon name="folder" :size="18" />{{ t('Choose file…') }}</button>
      <button ref="cancel" class="picker-cancel" :disabled="saving" @click="emit('close')">{{ t('Cancel') }}</button>
      <button ref="confirmButton" class="picker-add" :disabled="!choices.length || saving" @click="submit">
        {{ saving ? t('Saving…') : choices.length > 1 ? t('Add {0} apps', [choices.length]) : choices.length ? t('Add app') : t('Add') }}
      </button>
    </footer>
  </div>
</template>

<style scoped>
.app-picker {
  display: flex; flex-direction: column; min-height: 0; overflow: hidden;
  color: #f5f5f7; background: #222428;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
header { padding: 29px 30px 18px; }
.app-picker h2 { margin: 0; font-size: calc(31px * var(--ui-scale)); font-weight: 640; letter-spacing: -.043em; line-height: 1.12; }
header p { margin: 7px 0 0; color: #bdc0c6; font-size: calc(16px * var(--ui-scale)); line-height: 1.4; }
.picker-tools { display: flex; align-items: stretch; gap: 9px; padding: 0 28px 14px; }
.picker-search, .picker-more { background: #17191c; border: 1px solid #ffffff20; border-radius: 10px; }
.picker-search { flex: 1; min-width: 0; display: flex; align-items: center; padding-left: 13px; gap: 8px; color: #aaaeb6; }
.picker-search:has(input:focus-visible), :root[data-input-mode=directional] .picker-search:has(input:focus) { outline: 2px solid var(--accent); outline-offset: 1px; }
.app-picker .picker-search input[type=search] { min-width: 0; flex: 1; height: 46px; color: #f5f5f7; padding: 0; font: inherit; font-size: calc(16px * var(--ui-scale)); border: none; background: transparent; }
.app-picker .picker-search input:focus { outline: none; box-shadow: none; }
.picker-search input::-webkit-search-cancel-button { display: none; }
.picker-search input::placeholder { color: #a5a9b1; }
.picker-search button, .picker-more { display: grid; place-items: center; min-width: 42px; min-height: 42px; color: #c5c8cf; border-radius: 8px; }
.picker-search button { margin: 2px; }
.picker-more[aria-expanded=true], .picker-more:hover, .picker-search button:hover { background: #353940; }
.picker-options { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; padding: 0 30px 12px; }
.picker-options label, .picker-options button, .picker-message button { display: inline-flex; align-items: center; gap: 8px; min-height: 39px; font-size: 16px; }
.picker-options input { accent-color: var(--accent); width: 18px; height: 18px; }
.picker-options button, .picker-message button { color: var(--accent); }
.picker-list { height: calc(12px + var(--picker-rows) * 55px * var(--ui-scale)); outline: none; min-height: 0; max-height: min(50svh, 470px); overflow-y: auto; overscroll-behavior: contain; scroll-padding-block: 4px; padding: 3px 14px 9px; }
.picker-app { display: flex; align-items: center; gap: 15px; width: 100%; min-height: calc(55px * var(--ui-scale)); padding: 7px 14px; position: relative; text-align: left; border-radius: 9px; color: #f0f0f3; }
.picker-list:has(.picker-message:only-child) { display: grid; place-content: center; }
.picker-app + .picker-app::before { content: ''; position: absolute; left: 67px; top: 0; right: 13px; height: 1px; background: #ffffff0e; }
.picker-app:not(:disabled):hover { background: #ffffff08; }
.picker-app[aria-pressed=true]:not(:disabled) { background: var(--selected-surface); }
.picker-app:disabled { opacity: .62; }
.picker-name { flex: 1; min-width: 0; font-size: calc(19px * var(--ui-scale)); font-weight: 520; line-height: 1.25; overflow-wrap: anywhere; }
.picker-name small { display: block; margin-top: 3px; font-size: 13px; font-weight: 400; color: #b0b5be; overflow-wrap: anywhere; }
.picker-icon { flex-shrink: 0; width: 38px; height: 38px; display: grid; place-items: center; color: #ced6e1; background: #343942; border-radius: 10px; }
.picker-icon img { display: block; width: 27px; height: 27px; object-fit: contain; }
.theme-netflix,.theme-spotify { background: #101313; }
.theme-steam,.theme-internet { background: #26415b; }
.theme-launchbox { background: #523b30; color: #f4d4ae; }
.theme-plezy { background: #352d2a; }
.theme-silo { background: #2d2b37; }
.picker-icon img[src="/brands/steam.svg"], .picker-icon img[src="/brands/spotify.png"] { object-fit: cover; object-position: left; }
.picker-tick { width: 22px; height: 22px; flex-shrink: 0; display: grid; place-items: center; border-radius: 50%; border: 1.5px solid #757982; }
.picker-app[aria-pressed=true] .picker-tick { border-color: transparent; color: var(--on-accent); background: var(--accent); }
.picker-app:disabled .picker-tick { color: #d9dce2; background: #454950; }
.picker-added { color: #ccd0d8; font-size: 13px; }
.picker-message { display: flex; align-items: center; flex-direction: column; justify-content: center; text-align: center; gap: 7px; padding: 22px 12px; min-height: 105px; margin: 0; color: #c1c4cb; }
.picker-message strong { font-size: 19px; font-weight: 550; color: #eee; overflow-wrap: anywhere; }
.picker-message small, .picker-error { font-size: 15px; overflow-wrap: anywhere; }
.picker-error { margin: 0; padding: 10px 26px; color: #ffd1bf; }
footer { display: flex; align-items: center; gap: 10px; padding: 16px 25px 19px; border-top: 1px solid #ffffff14; background: #1f2125; }
footer button { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 43px; padding: 8px 18px; border-radius: 9px; font-size: calc(16px * var(--ui-scale)); font-weight: 560; }
.picker-file { padding-inline: 5px; color: var(--accent); }
.picker-cancel { margin-left: auto; background: #36393f; color: #ebecef; }
.picker-add { min-width: 90px; color: var(--on-accent); background: var(--accent); }
.picker-add:disabled { background: #33363b; color: #a2a7af; opacity: 1; }
.app-picker button:focus-visible, :root[data-input-mode=directional] .app-picker button:focus { outline: 2px solid var(--focus-ring); outline-offset: -2px; }
.app-picker .picker-app:focus-visible, :root[data-input-mode=directional] .app-picker .picker-app:focus { background: var(--focus-surface); }
@media (max-width:600px) {
  header { padding: 23px 18px 14px; }
  .picker-tools { padding: 0 16px 10px; }
  .picker-list { height: calc(12px + var(--picker-rows) * 50px * var(--ui-scale)); padding-inline: 6px; max-height: 55svh; }
  .picker-app { gap: 12px; min-height: 50px; padding-inline: 12px; }
  .picker-options { padding-inline: 18px; }
  footer { padding: 12px; gap: 8px; }
  footer button { padding-inline: 12px; font-size: 15px; }
  .picker-file { padding-inline: 2px; }
  .picker-add { min-width: 66px; }
}
@media (max-height:480px) {
  header { padding-block: 10px; }
  .picker-tools { padding-bottom: 6px; }
  footer { padding-block: 6px; }
}
</style>
<style>
.panel.picker-panel { display: flex; flex-direction: column; width: min(calc(635px * var(--ui-scale)), 100%); max-height: min(88svh, 900px); padding: 0; overflow: hidden; border-radius: 21px; background: #222428; }
@media (max-width:600px) { .overlay:has(.picker-panel) { padding: 12px; } .panel.picker-panel { width: 100%; max-height: calc(100svh - 24px); border-radius: 17px; } }
</style>
