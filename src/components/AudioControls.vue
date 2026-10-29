<script setup lang="ts">
import { t } from '../lib/i18n';
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
}>();
</script>
<template>
  <div class="audio-controls" :aria-busy="busy">
    <p v-if="!native" class="note"> {{ t('Audio controls are available in Canapey on Windows.') }} </p>
    <template v-else>
      <p v-if="error" class="inline-error" role="alert">{{ error }}</p>
      <p v-if="!state && busy" class="note" role="status"> {{ t('Finding audio outputs…') }} </p>
      <div class="audio-volume">
        <div class="audio-volume-heading">
          <label for="quick-volume"
            ><Icon :name="state?.muted ? 'muted' : 'volume'" :size="24" />{{ t('Master volume') }}</label
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
          :aria-valuetext="`${volume} %${state?.muted ? t(', muted') : ''}`"
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
          >{{ t('Mute') }}<small>{{
            state?.muted ? t('Sound is muted') : t('Mute sound')
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
        <h3>{{ t('Audio output') }}</h3>
        <p class="audio-caption">{{ t('Your PC’s default output.') }}</p>
        <p v-if="state && !state.outputs.length" class="note"> {{ t('No output connected. Turn on your TV or connect your headphones.') }} </p>
        <p v-else-if="state && !state.defaultId" class="note"> {{ t('Choose an output to enable sound.') }} </p>
        <div class="audio-output-list" role="group" :aria-label="t('Audio output')">
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
          <Icon name="refresh" :size="16" />{{ t('Refresh outputs') }} </button>
      </div>
    </template>
  </div>
</template>
