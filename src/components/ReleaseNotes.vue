<script setup lang="ts">
import { computed } from 'vue';
import { parseReleaseNotes } from '../lib/release-notes';
import ReleaseNoteText from './ReleaseNoteText.vue';
const props = defineProps<{ notes: string }>();
const blocks = computed(() => parseReleaseNotes(props.notes));
</script>
<template>
  <article class="release-notes" aria-label="Notes de version" tabindex="0">
    <template v-for="(block, index) in blocks" :key="index">
      <h4 v-if="block.kind === 'heading'"><ReleaseNoteText :text="block.text" /></h4>
      <ul v-else-if="block.kind === 'list'"><li v-for="(item, i) in block.items" :key="i"><ReleaseNoteText :text="item" /></li></ul>
      <p v-else><ReleaseNoteText :text="block.text" /></p>
    </template>
  </article>
</template>
