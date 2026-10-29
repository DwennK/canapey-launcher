<script setup lang="ts">
import { t } from '../lib/i18n';
import { computed, nextTick, onMounted, ref } from "vue";
import {
  focusDirection,
  focusElement,
  focusableItems,
} from "../lib/navigation";
import { eraseSelection, replaceSelection } from "../lib/text-entry";
import type { Action } from "../lib/types";
const props = defineProps<{
  value: string;
  label: string;
  start: number;
  end: number;
  maxLength: number;
  multiline: boolean;
}>();
const emit = defineEmits<{
  done: [value: string, cursor: number];
  cancel: [];
}>();
const root = ref<HTMLElement>();
const field = ref<HTMLTextAreaElement>();
const draft = ref(props.value);
const start = ref(props.start),
  end = ref(props.end);
const upper = ref(false),
  symbols = ref(false);
const rows = computed(() =>
  symbols.value
    ? ["1234567890", "@._-/:\\?!&", "()[]+*=,#%", "'\";<>|$€{}"]
    : ["qwertyuiop", "asdfghjkl", "zxcvbnm"],
);
function remember() {
  if (!field.value) return;
  start.value = field.value.selectionStart;
  end.value = field.value.selectionEnd;
}
async function change(insertion: string | null) {
  const result =
    insertion === null
      ? eraseSelection(draft.value, start.value, end.value)
      : replaceSelection(
          draft.value,
          start.value,
          end.value,
          insertion,
          props.maxLength,
        );
  draft.value = result.value;
  start.value = end.value = result.cursor;
  await nextTick();
  field.value?.setSelectionRange(result.cursor, result.cursor);
}
function caret(delta: number) {
  const before =
    Array.from(draft.value.slice(0, start.value)).at(-1)?.length ?? 0;
  const after = Array.from(draft.value.slice(end.value))[0]?.length ?? 0;
  start.value = end.value =
    delta < 0 ? start.value - before : end.value + after;
  field.value?.setSelectionRange(start.value, end.value);
}
function clear() {
  start.value = 0;
  end.value = draft.value.length;
  void change("");
}
function handle(action: Action) {
  if (action === "back") {
    emit("cancel");
    return;
  }
  if (action === "accept" || action === "accept-down") {
    const active = document.activeElement;
    if (active === field.value)
      focusElement(
        root.value?.querySelector<HTMLElement>(".keyboard-keys button") ??
          undefined,
      );
    else if (
      active instanceof HTMLButtonElement &&
      root.value?.contains(active)
    )
      active.click();
  } else if (root.value && ["left", "right", "up", "down"].includes(action)) {
    focusDirection(root.value, action);
  }
}
function keydown(event: KeyboardEvent) {
  if (event.isComposing) return;
  if (event.key === "Escape") {
    event.preventDefault();
    emit("cancel");
    return;
  }
  if (event.key === "Tab" && root.value) {
    const items = focusableItems(root.value);
    if (event.shiftKey && document.activeElement === items[0]) {
      event.preventDefault();
      focusElement(items.at(-1));
    } else if (!event.shiftKey && document.activeElement === items.at(-1)) {
      event.preventDefault();
      focusElement(items[0]);
    }
    return;
  }
  if (event.target === field.value) {
    if (event.key === "Enter" && (!props.multiline || !event.shiftKey)) {
      event.preventDefault();
      emit("done", draft.value, start.value);
    }
    return;
  }
  const actions: Record<string, Action> = {
    ArrowLeft: "left",
    ArrowRight: "right",
    ArrowUp: "up",
    ArrowDown: "down",
    Enter: "accept",
  };
  if (actions[event.key]) {
    event.preventDefault();
    if (event.key !== "Enter" || !event.repeat) handle(actions[event.key]);
  }
}
onMounted(() => {
  field.value?.setSelectionRange(start.value, end.value);
  focusElement(
    root.value?.querySelector<HTMLElement>(".keyboard-keys button") ??
      undefined,
  );
});
defineExpose({ handle });
</script>
<template>
  <div class="overlay keyboard-overlay" @click.self="emit('cancel')">
    <section
      ref="root"
      class="panel keyboard-panel"
      role="dialog"
      aria-modal="true"
      :aria-label="t('Keyboard — {0}', [label])"
      @keydown.stop="keydown"
      @keyup.stop
    >
      <div class="panel-heading">
        <div>
          <span class="eyebrow">{{ t('ON-SCREEN KEYBOARD') }}</span>
          <h2>{{ label }}</h2>
        </div>
      </div>
      <textarea
        ref="field"
        v-model="draft"
        :aria-label="label"
        :maxlength="maxLength < 0 ? undefined : maxLength"
        :rows="multiline ? 3 : 2"
        @input="remember"
        @select="remember"
        @keyup="remember"
        @click="remember"
      />
      <div class="keyboard-keys">
        <div v-for="(row, index) in rows" :key="index" class="keyboard-row">
          <button
            v-for="key in row"
            :key="key"
            :aria-label="t('Type {0}', [upper ? key.toUpperCase() : key])"
            @click="change(upper ? key.toUpperCase() : key)"
          >
            {{ upper ? key.toUpperCase() : key }}
          </button>
        </div>
      </div>
      <div class="keyboard-tools">
        <button :aria-pressed="upper" @click="upper = !upper">{{ t('Shift') }}</button>
        <button :aria-pressed="symbols" @click="symbols = !symbols">
          {{ symbols ? "ABC" : "123 / @" }}
        </button>
        <button @click="change(null)">{{ t('Delete') }}</button>
        <button :aria-label="t('Clear all text')" @click="clear">{{ t('Clear') }}</button>
        <button :aria-label="t('Cursor left')" @click="caret(-1)">←</button>
        <button :aria-label="t('Cursor right')" @click="caret(1)">→</button>
      </div>
      <div class="keyboard-bottom">
        <button @click="emit('cancel')">{{ t('Cancel') }}</button>
        <button class="keyboard-space" @click="change(' ')">{{ t('Space') }}</button>
        <button v-if="multiline" @click="change('\n')">{{ t('↵ New line') }}</button>
        <button class="primary-button" @click="emit('done', draft, start)"> {{ t('Done') }} </button>
      </div>
      <p class="note"> {{ t('Arrows / stick: move · A / Cross: type · B / Circle: cancel') }} </p>
    </section>
  </div>
</template>
<style scoped>
.keyboard-overlay {
  z-index: 25;
}
.keyboard-panel {
  width: min(780px, 100%);
  max-height: calc(100dvh - 32px);
  overflow: auto;
  padding: 28px;
}
.keyboard-panel h2 {
  font-size: 25px;
}
.keyboard-panel textarea {
  width: 100%;
  resize: vertical;
  font-size: 22px;
  margin-bottom: 18px;
}
.keyboard-row {
  display: grid;
  grid-template-columns: repeat(10, minmax(0, 1fr));
  gap: 7px;
  margin-bottom: 7px;
}
.keyboard-panel button {
  min-height: 48px;
  border: 1px solid #ffffff24;
  border-radius: 10px;
  background: #ffffff08;
  color: inherit;
  padding: 10px;
  font-size: 18px;
}
.keyboard-panel button:focus-visible {
  background: #ffffff24;
  outline: 2px solid #e9dece;
  outline-offset: 1px;
}
.keyboard-panel button[aria-pressed="true"] {
  background: #ffffff28;
}
.keyboard-tools,
.keyboard-bottom {
  display: flex;
  gap: 7px;
  margin-top: 10px;
}
.keyboard-tools button {
  flex: 1;
}
.keyboard-space {
  flex: 1;
}
.keyboard-panel .primary-button {
  background: #e9dece;
  color: #1b2028;
}
.keyboard-panel .note {
  margin: 16px 0 0;
}
@media (max-width: 600px) {
  .keyboard-panel {
    padding: 18px 12px;
  }
  .keyboard-panel h2 {
    font-size: 21px;
  }
  .keyboard-row {
    gap: 4px;
  }
  .keyboard-panel button {
    padding: 8px 3px;
    font-size: 14px;
    min-height: 42px;
  }
  .keyboard-tools,
  .keyboard-bottom {
    gap: 4px;
  }
}
</style>
