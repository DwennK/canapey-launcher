<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { t } from '../lib/i18n';
import { focusableItems, focusDirection, focusElement, rememberFocus, restoreFocus, type FocusBookmark } from '../lib/navigation';
import { findSettings, settingsPages, settingsSections, type SettingsPage } from '../lib/settings-navigation';
import type { Action } from '../lib/types';
import Icon from './Icon.vue';

const props = defineProps<{ route: SettingsPage; index: boolean; linkedFrom: SettingsPage | null; saveStatus: string }>();
const emit = defineEmits<{ open: [page: SettingsPage]; browse: []; detail: []; back: []; close: [] }>();
const rail = ref<HTMLElement>(), body = ref<HTMLElement>();
const searchField = ref<HTMLInputElement>(), searchButton = ref<HTMLButtonElement>();
const searching = ref(false), query = ref('');
const matches = computed(() => findSettings(query.value));
const sections = computed(() => settingsSections.map(section => ({
  title: section.title, pages: matches.value.filter(page => section.pages.some(entry => entry === page)),
})).filter(section => section.pages.length)
  .sort((a, b) => matches.value.indexOf(a.pages[0]!) - matches.value.indexOf(b.pages[0]!)));
const sectionName = computed(() => settingsSections.find(section => section.pages.some(page => page === props.route))!.title);
const bookmarks = new Map<SettingsPage, FocusBookmark>();
const compact = window.matchMedia('(max-width: 840px)');
let observer: MutationObserver | undefined;
let alive = true;
let hadContentFocus = false;
let searchOrigin: HTMLElement | null = null;
function focusRail() {
  const current = rail.value?.querySelector<HTMLElement>('[aria-current="page"]');
  focusElement(current ?? searchButton.value);
}
function focusContent() {
  if (!body.value || !alive || !body.value.getClientRects().length) return;
  if (body.value.querySelector('[aria-busy="true"]')) { focusElement(body.value); return; }
  const saved = bookmarks.get(props.route);
  if (saved && focusableItems(body.value).length) restoreFocus(body.value, saved);
  else focusElement(focusableItems(body.value)[0] ?? body.value);
}
function remember() {
  hadContentFocus = true;
  if (!body.value || document.activeElement === body.value) return;
  emit('detail');
  bookmarks.set(props.route, rememberFocus(body.value));
}
function leaveContent(event: FocusEvent) {
  if (event.relatedTarget) hadContentFocus = false;
}
async function openSearch() {
  if (!searching.value) searchOrigin = document.activeElement as HTMLElement | null;
  searching.value = true;
  await nextTick();
  searchField.value?.focus();
}
function closeSearch() {
  if (!searching.value) return false;
  searching.value = false;
  query.value = '';
  nextTick(() => {
    if (searchOrigin?.isConnected && searchOrigin.getClientRects().length) focusElement(searchOrigin);
    else if (compact.matches && !props.index) focusContent();
    else searchButton.value?.focus();
    searchOrigin = null;
  });
  return true;
}
function openPage(page: SettingsPage) {
  searching.value = false;
  query.value = '';
  emit('open', page);
  if (page === props.route) nextTick(focusContent);
}
function submitSearch(event: KeyboardEvent) {
  if (event.isComposing) return;
  event.preventDefault();
  event.stopPropagation();
  const page = matches.value[0];
  if (page) openPage(page);
}
function firstMatch() {
  focusElement(rail.value?.querySelector<HTMLElement>('[data-settings-route]') ?? searchField.value);
}
function navigate(action: Action) {
  const active = document.activeElement as HTMLElement;
  if (rail.value?.contains(active)) {
    const page = active.dataset.settingsRoute as SettingsPage | undefined;
    if (page && action === 'right') openPage(page);
    else if (action === 'up' || action === 'down') {
      // Pinned search and scrolled rows can overlap geometrically. Follow list order.
      const items = focusableItems(rail.value).filter(item => !item.classList.contains('end-search'));
      const index = items.indexOf(active === rail.value.querySelector('.end-search') ? searchField.value! : active);
      focusElement(items[index + (action === 'up' ? -1 : 1)]);
    } else focusDirection(rail.value, action);
    return;
  }
  if (active.closest('.settings-heading')) {
    if (action === 'down') focusContent();
    else if (action === 'left' && !compact.matches) { emit('browse'); focusRail(); }
    return;
  }
  if (!body.value) return;
  focusDirection(body.value, action);
  if (active !== document.activeElement) return;
  if (action === 'left' && !compact.matches) { emit('browse'); focusRail(); }
  else if (action === 'up') {
    const back = body.value.parentElement?.querySelector<HTMLElement>('.settings-heading button');
    if (back?.getClientRects().length) focusElement(back);
    else if (!compact.matches) { emit('browse'); focusRail(); }
  }
}
function syncVisibleFocus() {
  nextTick(() => {
    if (searching.value) searchField.value?.focus();
    else if (props.index) focusRail();
    else focusContent();
  });
}
watch(() => props.route, async () => {
  await nextTick();
  if (body.value) body.value.scrollTop = 0;
  focusContent();
});
onMounted(() => {
  compact.addEventListener('change', syncVisibleFocus);
  // A lazy page may initially have no controls. Hand focus to it once it loads.
  observer = new MutationObserver(() => {
    if (!alive || props.index || searching.value || body.value?.closest('[inert]')) return;
    const active = document.activeElement;
    if (active === body.value || (hadContentFocus && active === document.body) ||
        (body.value?.contains(active) && active?.matches(':disabled'))) focusContent();
  });
  if (body.value) observer.observe(body.value, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'aria-busy'] });
});
onUnmounted(() => { alive = false; observer?.disconnect(); compact.removeEventListener('change', syncVisibleFocus); });
defineExpose({ navigate, focusRail, openSearch, closeSearch });
</script>

<template>
  <div class="settings-shell" :class="{ 'show-index': index || searching }">
    <nav ref="rail" class="settings-rail" :aria-label="t('Settings pages')" data-nav-scope="settings-rail">
      <div class="rail-heading">
        <div class="rail-brand"><img src="/brand/canapey-mark.svg" alt="" />Canapey</div>
        <button class="settings-close" :aria-label="t('Close settings')" @click="emit('close')"><Icon name="close" :size="19" /></button>
      </div>
      <h2>{{ t('Settings') }}</h2>
      <div class="settings-find">
        <Icon name="search" :size="18" />
        <input v-if="searching" ref="searchField" v-model="query" type="search" :aria-label="t('Search settings')" :placeholder="t('Find a setting')" autocomplete="off"
          @keydown.enter="submitSearch" @keydown.down.prevent.stop="firstMatch" @keydown.esc.prevent.stop="closeSearch" />
        <button v-if="searching" class="end-search" :aria-label="t('Cancel search')" @click="closeSearch"><Icon name="close" :size="15" /></button>
        <button v-else ref="searchButton" @click="openSearch">{{ t('Find a setting') }}</button>
      </div>
      <div class="settings-sections">
        <div v-for="section in sections" :key="section.title" class="rail-section" role="group" :aria-label="t(section.title)">
          <h3>{{ t(section.title) }}</h3>
          <button v-for="page in section.pages" :key="page" :data-settings-route="page" :data-focus-key="`settings:${page}`"
            :aria-current="route === page ? 'page' : undefined" @focus="!searching && emit('browse')" @click="openPage(page)">
            <span class="rail-icon"><Icon :name="settingsPages[page].icon" :size="19" /></span>
            {{ t(settingsPages[page].title) }}
          </button>
        </div>
        <p v-if="!sections.length" role="status">{{ t('No matching settings.') }}</p>
      </div>
    </nav>
    <section class="settings-detail" aria-labelledby="settings-page-title">
      <header class="settings-heading">
        <button v-if="linkedFrom" class="settings-back" @click="emit('back')"><Icon name="back" :size="18" />{{ t('Back to {0}', [t(settingsPages[linkedFrom].title)]) }}</button>
        <button v-else class="settings-back compact-back" :aria-label="t('Back to settings')" @click="emit('back')"><Icon name="back" :size="18" />{{ t('Settings') }}</button>
        <p>{{ t(sectionName) }}</p><h2 id="settings-page-title">{{ t(settingsPages[route].title) }}</h2>
      </header>
      <div ref="body" class="settings-content" :data-settings-page="route" data-nav-scope="settings-content" tabindex="-1" @focusin="remember" @focusout="leaveContent">
        <div :key="route" class="settings-page"><slot /></div>
      </div>
      <div class="settings-save" role="status"><Icon v-if="!saveStatus || saveStatus === t('Saved')" name="check" :size="16" />{{ saveStatus || t('Changes save automatically') }}</div>
    </section>
  </div>
</template>
