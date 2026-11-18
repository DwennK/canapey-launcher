<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from 'vue';
import { t } from '../lib/i18n';
import { focusableItems, focusElement } from '../lib/navigation';
import type { Action } from '../lib/types';
import Icon from './Icon.vue';
const props = defineProps<{ select: HTMLSelectElement }>();
const emit = defineEmits<{ done: [index: number]; cancel: [] }>();
const root = ref<HTMLElement>();
const label = props.select.labels?.[0];
const title = props.select.getAttribute('aria-label') || label?.querySelector('span')?.firstChild?.textContent?.trim()
  || (label ? Array.from(label.childNodes).filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent).join('').trim() : '')
  || t('Choose an option');
const options = Array.from(props.select.options).map((option, index) => ({
  label: option.text, index, disabled: option.disabled || (option.parentElement instanceof HTMLOptGroupElement && option.parentElement.disabled),
}));
function handle(action: Action) {
  if (action === 'back') { emit('cancel'); return; }
  if (!root.value) return;
  const items = focusableItems(root.value);
  const current = items.indexOf(document.activeElement as HTMLElement);
  if (action === 'up' || action === 'down') {
    focusElement(items[Math.max(0, Math.min(items.length - 1, current + (action === 'up' ? -1 : 1)))]);
  } else if (action === 'accept') (document.activeElement as HTMLElement)?.click();
}
function keydown(event: KeyboardEvent) {
  const action = ({ ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'accept', Escape: 'back', Backspace: 'back' } as Record<string, Action>)[event.key];
  if (action) { event.preventDefault(); event.stopImmediatePropagation(); handle(action); }
  else if (event.key === 'Tab' && root.value) {
    event.preventDefault(); event.stopImmediatePropagation();
    const items = focusableItems(root.value), current = items.indexOf(document.activeElement as HTMLElement);
    focusElement(items[(current + (event.shiftKey ? -1 : 1) + items.length) % items.length]);
  }
}
onMounted(async () => {
  document.addEventListener('keydown', keydown, true);
  await nextTick();
  focusElement(root.value?.querySelector<HTMLElement>(`[data-choice="${props.select.selectedIndex}"]:not(:disabled)`)
    ?? (root.value ? focusableItems(root.value).find(item => item.hasAttribute('data-choice')) : undefined));
});
onUnmounted(() => document.removeEventListener('keydown', keydown, true));
defineExpose({ handle });
</script>
<template>
  <div class="choice-overlay" @click.self="emit('cancel')">
    <section ref="root" class="setting-choice" role="dialog" aria-modal="true" aria-labelledby="setting-choice-title">
      <header><h2 id="setting-choice-title">{{ title }}</h2><button :aria-label="t('Cancel')" @click="emit('cancel')"><Icon name="close" /></button></header>
      <div class="choice-options">
        <button v-for="option in options" :key="option.index" :data-choice="option.index" :disabled="option.disabled" :aria-pressed="select.selectedIndex === option.index" @click="emit('done', option.index)">
          <span>{{ option.label }}</span><Icon v-if="select.selectedIndex === option.index" name="check" />
        </button>
      </div>
      <p>{{ t('↑ ↓ Navigate · OK Choose · Back Cancel') }}</p>
    </section>
  </div>
</template>
