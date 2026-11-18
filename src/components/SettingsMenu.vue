<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { t } from '../lib/i18n';
import { focusableItems, focusDirection, focusElement, rememberFocus, restoreFocus, type FocusBookmark } from '../lib/navigation';
import { findSettings, isSettingsPage, settingsBranch, settingsChildren, settingsEntry, settingsParent, type SettingsRoute } from '../lib/settings-navigation';
import type { Action } from '../lib/types';
import Icon from './Icon.vue';
const props = defineProps<{ route: SettingsRoute; backTo: SettingsRoute | null; lastPage: string; saveStatus: string }>();
const emit = defineEmits<{ open: [route: SettingsRoute]; back: []; close: [] }>();
const body = ref<HTMLElement>(), header = ref<HTMLElement>();
const entry = computed(() => settingsEntry(props.route));
const parent = computed(() => settingsParent(props.route));
const children = computed(() => settingsChildren(props.route));
const bookmarks = new Map<string, FocusBookmark>();
let observer: MutationObserver | undefined, alive = true;
const rail = ref<HTMLElement>(), searchField = ref<HTMLInputElement>(), searchButton = ref<HTMLButtonElement>();
const searching = ref(false), query = ref('');
const results = computed(() => findSettings(query.value));
const sections = settingsChildren('root');
const activeBranch = computed(() => isSettingsPage(props.route) ? settingsBranch(props.route) : props.route);
function focusRail() {
  const target = rail.value?.querySelector<HTMLElement>('[aria-current]') ?? rail.value?.querySelector<HTMLElement>('button');
  if (target?.getClientRects().length) focusElement(target);
}
async function openSearch() {
  searching.value = true;
  await nextTick();
  searchField.value?.focus();
}
function openFirstResult(event: KeyboardEvent) {
  if (event.isComposing || !results.value.length) return;
  event.preventDefault();
  event.stopPropagation();
  openRoute(results.value[0]!);
}
function closeSearch() {
  if (!searching.value) return false;
  searching.value = false;
  query.value = '';
  nextTick(() => searchButton.value?.focus());
  return true;
}
function openRoute(route: SettingsRoute) {
  searching.value = false;
  query.value = '';
  if (route === props.route) {
    nextTick(focusContent);
    return;
  }
  emit('open', route);
}
function remember() { if (!searching.value && body.value?.contains(document.activeElement)) bookmarks.set(props.route, rememberFocus(body.value)); }
function focusContent() {
  if (!body.value || !alive) return;
  if (searching.value) { searchField.value?.focus(); return; }
  const items = focusableItems(body.value);
  if (!items.length) { focusElement(body.value); return; }
  const saved = bookmarks.get(props.route);
  if (saved) { restoreFocus(body.value, saved); return; }
  const preferred = props.route === 'root' ? settingsBranch(props.lastPage) : props.lastPage;
  const target = body.value.querySelector<HTMLElement>(`[data-settings-route="${preferred}"]`);
  focusElement(target ?? items[0] ?? body.value);
}
function navigate(action: Action) {
  if (!body.value || !header.value) return;
  if (header.value.contains(document.activeElement)) {
    if (action === 'down') focusContent();
    else focusDirection(header.value, action);
  } else if (rail.value?.contains(document.activeElement)) {
    if (action === 'right') focusContent();
    else {
      const previous = document.activeElement;
      focusDirection(rail.value, action);
      if (action === 'up' && previous === document.activeElement) searchButton.value?.focus();
    }
  } else {
    const previous = document.activeElement;
    focusDirection(body.value, action);
    if (previous === document.activeElement) {
      if (action === 'left' && !searching.value) focusRail();
      if (action === 'up') searchButton.value?.focus();
    }
  }
}
watch(() => props.route, async () => { await nextTick(); focusContent(); });
onMounted(async () => {
  await nextTick();
  if (!alive) return;
  focusContent();
  // Async settings pages may mount after the route changes. Never steal an existing focus.
  observer = new MutationObserver(() => {
    const active = document.activeElement;
    if (body.value === active || (active === document.body && bookmarks.has(props.route))
        || (active && body.value?.contains(active) && active.matches(':disabled'))) focusContent();
  });
  if (body.value) observer.observe(body.value, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] });
});
onUnmounted(() => { alive = false; observer?.disconnect(); });
defineExpose({ navigate, focusContent, openSearch, closeSearch });
</script>

<template>
  <div class="settings-shell">
    <header ref="header" class="settings-header" data-nav-scope="settings-header">
      <button class="settings-back" :aria-label="searching ? t('Back to {0}', [t(entry.title)]) : backTo ? t('Back to {0}', [t(settingsEntry(backTo).title)]) : t('Back to Home')" @click="closeSearch() || emit('back')"><Icon name="back" :size="25" /></button>
      <div class="settings-heading">
        <p v-if="parent && !searching" class="settings-breadcrumb">{{ parent === 'root' ? t('Settings') : `${t('Settings')} / ${t(settingsEntry(parent).title)}` }}</p>
        <h2 id="settings-page-title">{{ searching ? t('Find a setting') : t(entry.title) }}</h2>
      </div>
      <button ref="searchButton" class="settings-find" :aria-label="t('Find a setting')" @click="openSearch"><Icon name="search" :size="21" /><span>{{ t('Find a setting') }}</span></button>
      <button class="settings-close" :aria-label="t('Close settings')" @click="emit('close')"><Icon name="close" :size="23" /></button>
    </header>
    <div class="settings-workspace">
      <nav v-if="route !== 'root' && !searching" ref="rail" class="settings-rail" data-nav-scope="settings-rail" :aria-label="t('Settings categories')">
        <button v-for="section in sections" :key="section" :aria-current="activeBranch === section ? 'true' : undefined"
          :aria-label="t('Go to {0}', [t(settingsEntry(section).title)])" @click="openRoute(section)">
          <Icon :name="settingsEntry(section).icon" :size="21" /><span>{{ t(settingsEntry(section).title) }}</span>
        </button>
      </nav>
      <div ref="body" class="settings-content" :class="{ 'settings-menu-list': !isSettingsPage(route) }" :data-settings-page="route" data-nav-scope="settings-content" tabindex="-1" @focusin="remember">
        <div v-if="searching" class="settings-search">
          <input ref="searchField" v-model="query" type="search" @keydown.enter="openFirstResult" :aria-label="t('Search settings')" :placeholder="t('Search settings')" autocomplete="off" />
          <nav class="settings-destinations" :aria-label="t('Matching settings')">
            <button v-for="page in results" :key="page" class="settings-destination" @click="openRoute(page)">
              <Icon :name="settingsEntry(page).icon" :size="24" /><span><strong>{{ t(settingsEntry(page).title) }}</strong><small>{{ t(settingsEntry(page).description) }}</small></span><Icon name="right" :size="18" />
            </button>
          </nav>
          <p v-if="!results.length" role="status">{{ t('No matching settings.') }}</p>
        </div>
        <div v-show="!searching">
          <template v-if="children.length">
            <p class="settings-description">{{ t(entry.description) }}</p>
            <nav :aria-label="t(entry.title)" class="settings-destinations">
              <button v-for="destination in children" :key="destination" class="settings-destination" :aria-label="t(settingsEntry(destination).title)" :aria-describedby="`settings-description-${destination}`" :data-settings-route="destination" :data-focus-key="`settings:${destination}`" @click="openRoute(destination)">
                <Icon :name="settingsEntry(destination).icon" :size="30" />
                <span><strong>{{ t(settingsEntry(destination).title) }}</strong><small :id="`settings-description-${destination}`">{{ t(settingsEntry(destination).description) }}</small></span>
                <Icon name="right" :size="22" />
              </button>
            </nav>
          </template>
          <div v-else :key="route" class="settings-page"><slot /></div>
        </div>
      </div>
    </div>
    <span class="settings-save" role="status">{{ saveStatus || t('Changes save automatically') }}</span>
  </div>
</template>
