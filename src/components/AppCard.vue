<script setup lang="ts">
import Icon from "./Icon.vue";
import type { Theme } from "../lib/types";
defineProps<{
  name: string;
  theme: Theme;
  image?: string;
  icon?: string;
  selected?: boolean;
  special?: string;
  suggestion?: boolean;
  running?: boolean;
  web?: boolean;
}>();
defineEmits<{ select: []; activate: [] }>();
</script>
<template>
  <button
    class="app-card"
    :class="[theme, { selected, special: !!special }]"
    :aria-label="`${name}${suggestion ? ' — à ajouter' : ''}${running ? ' — en cours' : ''}`"
    :aria-pressed="selected"
    :tabindex="selected ? 0 : -1"
    @focus="$emit('select')"
    @click="$emit('activate')"
  >
    <span class="card-visual">
      <img
        v-if="image"
        class="card-image"
        :src="image"
        alt=""
        loading="lazy"
        draggable="false"
        @error="($event.target as HTMLImageElement).style.display = 'none'"
      />
      <span class="card-shade" />
      <span v-if="special === 'add'" class="add-symbol"
        ><Icon name="plus" :size="38"
      /></span>
      <span v-else-if="special === 'windows'" class="windows-mark"
        ><i v-for="n in 4" :key="n"
      /></span>
      <span v-else class="card-wordmark" :class="theme"
        ><img
          v-if="icon && theme === 'home'"
          :src="icon"
          alt=""
          @error="($event.target as HTMLImageElement).style.display = 'none'"
        /><span v-if="theme === 'youtube'" class="youtube-mark">▶</span
        ><Icon v-if="theme === 'internet'" name="globe" class="brand-icon" />{{
          name
        }}</span
      >
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
