<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { t } from '../lib/i18n';
import { focusableItems, focusDirection, focusElement, rememberFocus, restoreFocus, type FocusBookmark } from '../lib/navigation';
import { isSettingsPage, settingsBranch, settingsChildren, settingsEntry, settingsParent, type SettingsRoute } from '../lib/settings-navigation';
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
function remember() { if (body.value?.contains(document.activeElement)) bookmarks.set(props.route, rememberFocus(body.value)); }
function focusContent() {
  if (!body.value || !alive) return;
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
  } else focusDirection(body.value, action);
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
defineExpose({ navigate, focusContent });
</script>

<template>
  <div class="settings-shell">
    <header ref="header" class="settings-header" data-nav-scope="settings-header">
      <button class="settings-back" :aria-label="backTo ? t('Back to {0}', [t(settingsEntry(backTo).title)]) : t('Back to Home')" @click="emit('back')"><Icon name="back" :size="25" /></button>
      <div class="settings-heading">
        <p class="settings-breadcrumb">{{ parent ? (parent === 'root' ? t('Settings') : `${t('Settings')} / ${t(settingsEntry(parent).title)}`) : 'CANAPEY' }}</p>
        <h2 id="settings-page-title">{{ t(entry.title) }}</h2>
      </div>
      <button class="settings-close" :aria-label="t('Close settings')" @click="emit('close')"><Icon name="close" :size="23" /></button>
    </header>
    <div ref="body" class="settings-content" :class="{ 'settings-menu-list': !isSettingsPage(route) }" :data-settings-page="route" data-nav-scope="settings-content" tabindex="-1" @focusin="remember">
      <template v-if="children.length">
        <p class="settings-description">{{ t(entry.description) }}</p>
        <nav :aria-label="t(entry.title)" class="settings-destinations">
          <button v-for="destination in children" :key="destination" class="settings-destination" :aria-label="t(settingsEntry(destination).title)" :aria-describedby="`settings-description-${destination}`" :data-settings-route="destination" :data-focus-key="`settings:${destination}`" @click="emit('open', destination)">
            <Icon :name="settingsEntry(destination).icon" :size="30" />
            <span><strong>{{ t(settingsEntry(destination).title) }}</strong><small :id="`settings-description-${destination}`">{{ t(settingsEntry(destination).description) }}</small></span>
            <Icon name="right" :size="22" />
          </button>
        </nav>
      </template>
      <div v-else :key="route" class="settings-page"><slot /></div>
    </div>
    <span class="settings-save" role="status">{{ saveStatus || t('Changes save automatically') }}</span>
  </div>
</template>
