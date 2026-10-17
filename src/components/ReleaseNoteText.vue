<script setup lang="ts">
import { noteFragments } from '../lib/release-notes';
defineProps<{ text: string }>();
</script>
<template>
  <template v-for="(part, index) in noteFragments(text)" :key="index"><strong v-if="part.kind === 'strong'">{{ part.text }}</strong><code v-else-if="part.kind === 'code'">{{ part.text }}</code><template v-else>{{ part.text }}</template></template>
</template>
