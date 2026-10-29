<script setup lang="ts">
defineProps<{ name: string; busy: boolean; error: string }>();
defineEmits<{ restore: []; dismiss: [] }>();
</script>

<template>
  <div class="removal-notice">
    <div><p role="status">Carte « {{ name }} » retirée.</p><p v-if="error" class="removal-error" role="alert">{{ error }}</p></div>
    <button class="small-button" :disabled="busy" @click="$emit('restore')">{{ busy ? 'Restauration…' : 'Restaurer la carte' }}</button>
    <button class="text-button" :disabled="busy" aria-label="Fermer la restauration" @click="$emit('dismiss')">Fermer</button>
  </div>
</template>

<style scoped>
.removal-notice { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; padding: 14px 0; border-block: 1px solid #ffffff20; }
.removal-notice > div { flex: 1 1 200px; min-width: 0; }
p { margin: 0; font-size: var(--text-body, 16px); overflow-wrap: anywhere; }
.removal-error { color: #ffb3a7; margin-top: 8px; font-size: var(--text-help, 14px); }
</style>
