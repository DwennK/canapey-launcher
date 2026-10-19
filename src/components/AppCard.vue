<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch } from "vue";
import { CardHold } from "../lib/hold";
import Icon from "./Icon.vue";
import type { Theme } from "../lib/types";
const props = defineProps<{
  name: string;
  theme: Theme;
  image?: string;
  icon?: string;
  selected?: boolean;
  special?: string;
  suggestion?: boolean;
  running?: boolean;
  web?: boolean;
  hasOptions?: boolean;
  holding?: boolean;
}>();
const emit = defineEmits<{ select: []; activate: []; options: [] }>();
// Identity comes from the app, never from the selected background theme.
const brandLogos = new Map([
  ["netflix", "/brands/netflix.svg"],
  ["youtube", "/brands/youtube.svg"],
  ["spotify", "/brands/spotify.png"],
  ["steam", "/brands/steam.svg"],
  ["plezy", "/brands/plezy.svg"],
  ["silo", "/brands/silo.svg"],
]);
const failedLogos = ref<string[]>([]);
const logo = computed(() =>
  [props.icon, brandLogos.get(props.name.trim().toLowerCase())].find(
    (src) => src && !failedLogos.value.includes(src),
  ),
);
watch(() => [props.icon, props.name], () => { failedLogos.value = []; });
function logoFailed() {
  if (logo.value) failedLogos.value.push(logo.value);
}
const touching = ref(false);
let pointer: { id: number; x: number; y: number } | null = null;
let suppressClick = false;
const hold = new CardHold((active) => (touching.value = active));
function cancelTouch() {
  if (pointer) suppressClick = true;
  pointer = null;
  hold.cancel();
}
function pointerDown(event: PointerEvent) {
  suppressClick = false;
  if (!props.hasOptions || event.pointerType === "mouse" || !event.isPrimary)
    return;
  pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
  emit("select");
  hold.start("touch", () => {
    suppressClick = true;
    emit("options");
  });
}
function pointerMove(event: PointerEvent) {
  if (
    pointer?.id === event.pointerId &&
    Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 12
  )
    cancelTouch();
}
function pointerUp(event: PointerEvent) {
  if (pointer?.id !== event.pointerId) return;
  if (!hold.release("touch")) suppressClick = true;
  pointer = null;
}
function click(event: MouseEvent) {
  if (suppressClick && event.detail !== 0) {
    suppressClick = false;
    return;
  }
  emit("activate");
}
function contextMenu(event: MouseEvent) {
  if (!props.hasOptions) return;
  event.preventDefault();
  cancelTouch();
  emit("options");
}
// A touch release can target the newly opened overlay rather than the card.
// Consume that gesture's compatibility click in capture phase, wherever it lands.
function suppressGestureClick(event: MouseEvent) {
  if (!suppressClick || event.detail === 0) return;
  suppressClick = false;
  event.preventDefault();
  event.stopImmediatePropagation();
}
const resetClick = () => {
  suppressClick = false;
};
onMounted(() => {
  window.addEventListener("blur", cancelTouch);
  document.addEventListener("click", suppressGestureClick, true);
  document.addEventListener("pointerdown", resetClick, true);
});
onUnmounted(() => {
  cancelTouch();
  window.removeEventListener("blur", cancelTouch);
  document.removeEventListener("click", suppressGestureClick, true);
  document.removeEventListener("pointerdown", resetClick, true);
});
</script>
<template>
  <button
    class="app-card"
    :class="[theme, { selected, special: !!special }]"
    :aria-label="`${name}${suggestion ? ' — à ajouter' : ''}${running ? ' — en cours' : ''}`"
    :aria-pressed="selected"
    :tabindex="selected ? 0 : -1"
    :aria-haspopup="hasOptions ? 'dialog' : undefined"
    @contextmenu="contextMenu"
    @pointerdown="pointerDown"
    @pointermove="pointerMove"
    @pointerup="pointerUp"
    @pointercancel="cancelTouch"
    @pointerleave="cancelTouch"
    @focus="$emit('select')"
    @click="click"
  >
    <span class="card-visual">
      <img
        v-if="image"
        class="card-image"
        :src="image"
        alt=""
        :loading="selected ? 'eager' : 'lazy'"
        :fetchpriority="selected ? 'high' : 'auto'"
        draggable="false"
        @error="($event.target as HTMLImageElement).style.display = 'none'"
      />
      <span class="card-shade" />
      <span
        v-if="holding || touching"
        class="card-hold-progress"
        aria-hidden="true"
      />
      <span v-if="special === 'add'" class="add-symbol"
        ><Icon name="plus" :size="38"
      /></span>
      <span v-else-if="special === 'windows'" class="windows-mark"
        ><i v-for="n in 4" :key="n"
      /></span>
      <span v-else-if="logo" class="card-logo">
        <img
          :key="logo"
          :src="logo"
          :class="{ 'native-app-icon': logo === icon }"
          alt=""
          draggable="false"
          @error="logoFailed"
        />
      </span>
      <span v-else class="card-wordmark">
        <Icon v-if="name === 'Internet'" name="globe" class="brand-icon" />{{ name }}
      </span>
      <span v-if="web" class="web-label"
        ><Icon name="globe" :size="10" />WEB</span
      >
      <span v-if="running" class="running-dot" aria-label="En cours" />
      <span v-if="suggestion" class="suggestion-label">À ajouter</span>
    </span>
    <span class="card-caption"
      ><span>{{ name }}</span
      ><Icon v-if="selected" name="right" :size="16"
    /></span>
  </button>
</template>
