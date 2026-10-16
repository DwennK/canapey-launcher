<script setup lang="ts">
import Icon from "./Icon.vue";
import type { AudioState } from "../lib/types";
defineProps<{
  state: AudioState | null;
  volume: number;
  busy: boolean;
  switching: boolean;
  error: string;
  native: boolean;
}>();
const emit = defineEmits<{
  volume: [value: number];
  mute: [];
  output: [id: string];
  refresh: [];
  sleep: [];
}>();
</script>
<template>
  <div class="audio-controls" :aria-busy="busy">
    <p v-if="!native" class="note">
      Les commandes audio sont disponibles dans Canapey sous Windows.
    </p>
    <template v-else>
      <p v-if="error" class="inline-error" role="alert">{{ error }}</p>
      <p v-if="!state && busy" class="note" role="status">
        Recherche des sorties audio…
      </p>
      <div class="audio-volume">
        <div class="audio-volume-heading">
          <label for="quick-volume"
            ><Icon :name="state?.muted ? 'muted' : 'volume'" :size="24" />Volume
            général</label
          >
          <output for="quick-volume">{{
            state?.volume != null ? volume + " %" : "—"
          }}</output>
        </div>
        <input
          id="quick-volume"
          data-audio-volume
          type="range"
          min="0"
          max="100"
          step="2"
          :value="volume"
          :disabled="state?.volume == null || switching"
          :aria-valuetext="`${volume} %${state?.muted ? ', son coupé' : ''}`"
          @input="
            emit('volume', Number(($event.target as HTMLInputElement).value))
          "
        />
        <div class="audio-range-labels"><span>0</span><span>100</span></div>
      </div>
      <button
        class="audio-mute"
        :aria-pressed="state?.muted ?? false"
        :aria-disabled="busy || state?.volume == null"
        @click="!busy && state?.volume != null && emit('mute')"
      >
        <Icon :name="state?.muted ? 'muted' : 'volume'" />
        <span
          >Muet<small>{{
            state?.muted ? "Le son est coupé" : "Couper le son"
          }}</small></span
        >
        <span
          class="audio-toggle"
          :class="{ on: state?.muted }"
          aria-hidden="true"
          ><i
        /></span>
      </button>
      <div class="audio-outputs">
        <h3>Sortie audio</h3>
        <p class="audio-caption">La sortie par défaut de votre PC.</p>
        <p v-if="state && !state.outputs.length" class="note">
          Aucune sortie connectée. Allumez votre TV ou connectez votre casque.
        </p>
        <p v-else-if="state && !state.defaultId" class="note">
          Choisissez une sortie pour activer le son.
        </p>
        <div class="audio-output-list" role="group" aria-label="Sortie audio">
          <button
            v-for="output in state?.outputs ?? []"
            :key="output.id"
            :data-focus-key="`audio:${output.id}`"
            :aria-pressed="output.id === state?.defaultId"
            :aria-disabled="busy"
            @click="!busy && emit('output', output.id)"
          >
            <Icon name="volume" :size="22" /><span>{{ output.name }}</span>
            <Icon
              v-if="output.id === state?.defaultId"
              name="check"
              :size="20"
            />
          </button>
        </div>
        <button
          class="audio-refresh"
          :aria-disabled="busy"
          @click="!busy && emit('refresh')"
        >
          <Icon name="refresh" :size="16" />Actualiser les sorties
        </button>
      </div>
    </template>
    <div class="audio-sleep">
      <button :disabled="!native" @click="emit('sleep')">
        <Icon name="moon" /><span>Mettre en veille</span
        ><Icon name="right" :size="18" />
      </button>
    </div>
  </div>
</template>
