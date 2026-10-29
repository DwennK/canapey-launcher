<script setup lang="ts">
import { t } from '../lib/i18n';
import { controllerLabels } from "../lib/controller-labels";
import { computed } from "vue";
import type { ControllerSnapshot } from "../lib/types";
const props = defineProps<{
  snapshot: ControllerSnapshot | null;
  controllerName: string | null;
  testing: boolean;
  native: boolean;
  deadzone: number;
}>();
const emit = defineEmits<{ toggle: []; deadzone: [value: number] }>();
const labels = computed(() => controllerLabels(props.snapshot?.name ?? props.controllerName));
const buttons = computed(() => [
  ...(['south', 'east', 'west', 'north', 'lb', 'rb', 'lt', 'rt'] as const).map(id => [id, labels.value[id]]),
  ['ls', 'L3'], ['rs', 'R3'], ['select', labels.value.select], ['start', labels.value.menu],
  ['guide', 'Guide'], ['up', '↑'], ['down', '↓'], ['left', '←'], ['right', '→'],
]);
const axes = computed(() => props.snapshot?.axes ?? [0, 0, 0, 0]);
const directions = computed(() => ({ left: t('Left'), right: t('Right'), up: t('Up'), down: t('Down') }));
function adjust(delta: number) {
  emit(
    "deadzone",
    Math.min(
      0.5,
      Math.max(0.1, Math.round((props.deadzone + delta) * 100) / 100),
    ),
  );
}
</script>
<template>
  <div class="controller-tester" :class="{ testing }">
    <h3>{{ t('Test controller') }}</h3>
    <p class="note" v-if="!native"> {{ t('The test requires Canapey on Windows. No controller data is simulated in this preview.') }} </p>
    <p class="note" v-else-if="!testing"> {{ t('Start the test, then try each button and stick. Hold') }} {{ labels.backName }} {{ t('for 1.2 s, or press Escape, to stop the test.') }} </p>
    <div class="test-toolbar">
      <button
        class="small-button"
        :disabled="!native"
        data-controller-test-toggle
        @click="emit('toggle')"
      >
        {{ testing ? t('Stop test') : t('Start test') }}
      </button>
      <span role="status">{{
        testing
          ? (snapshot?.name ?? t('Waiting for a controller…'))
          : t('Test stopped')
      }}</span>
    </div>
    <div class="test-buttons" :aria-label="t('Received buttons')">
      <span
        v-for="[id, label] in buttons"
        :key="id"
        :data-button="id"
        :class="{ pressed: testing && snapshot?.buttons.includes(id) }"
        >{{ label }}</span
      >
    </div>
    <div class="test-sticks">
      <div
        v-for="(label, index) in [t('Left stick'), t('Right stick')]"
        :key="label"
        class="test-stick"
      >
        <h4>{{ label }}</h4>
        <div
          class="stick-map"
          :aria-label="`${label} : X ${axes[index * 2]?.toFixed(2)}, Y ${axes[index * 2 + 1]?.toFixed(2)}`"
        >
          <div
            v-if="index === 0"
            class="stick-threshold"
            :style="{
              width: `${Math.min(deadzone + 0.2, 0.75) * 100}%`,
              height: `${Math.min(deadzone + 0.2, 0.75) * 100}%`,
            }"
          />
          <div
            v-if="index === 0"
            class="stick-neutral"
            :style="{
              width: `${deadzone * 100}%`,
              height: `${deadzone * 100}%`,
            }"
          />
          <span
            class="stick-dot"
            :style="{
              left: `${50 + axes[index * 2]! * 50}%`,
              top: `${50 - axes[index * 2 + 1]! * 50}%`,
            }"
          />
        </div>
        <output
          >X {{ axes[index * 2]?.toFixed(2) }} · Y
          {{ axes[index * 2 + 1]?.toFixed(2) }}</output
        >
      </div>
    </div>
    <div class="test-triggers">
      <label
        v-for="(label, index) in [t('Left trigger'), t('Right trigger')]"
        :key="label"
        >{{ label
        }}<meter min="0" max="1" :value="snapshot?.triggers[index] ?? 0" />{{
          Math.round((snapshot?.triggers[index] ?? 0) * 100)
        }}
        %</label
      >
    </div>
    <p class="test-direction"> {{ t('Left stick direction:') }} <strong>{{
        snapshot?.direction ? directions[snapshot.direction] : t('Neutral')
      }}</strong>
    </p>
    <div v-if="!testing" class="test-deadzone">
      <span
        >{{ t('Deadzone:') }} <strong>{{ Math.round(deadzone * 100) }} %</strong></span
      >
      <button
        class="small-button"
        :aria-label="t('Decrease deadzone')"
        :disabled="testing || deadzone <= 0.1"
        @click="adjust(-0.05)"
      >
        −
      </button>
      <button
        class="small-button"
        :aria-label="t('Increase deadzone')"
        :disabled="testing || deadzone >= 0.5"
        @click="adjust(0.05)"
      >
        +
      </button>
    </div>
    <p class="note" v-if="!testing"> {{ t('Stop the test to adjust the deadzone. Then leave the stick at rest to check for drift. The solid square shows the release threshold; the dashed square shows the trigger threshold (+20 points). The right stick is shown for diagnostics.') }} </p>
    <p class="note" v-if="!testing"> {{ t('Values received from the driver, before Canapey’s navigation filter. Steam Input may alter signals; some system buttons are reserved by Windows.') }} </p>
  </div>
</template>
<style scoped>
.test-toolbar,
.test-deadzone {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin: 20px 0;
}
.test-toolbar span {
  font-size: 13px;
  color: #c5c7cc;
}
.test-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}
.test-buttons span {
  padding: 8px 12px;
  min-width: 42px;
  text-align: center;
  border: 1px solid #ffffff20;
  border-radius: 8px;
  font-size: 13px;
}
.test-buttons .pressed {
  color: #17231e;
  background: #acd8ba;
  border-color: #acd8ba;
}
.test-sticks {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-top: 24px;
}
.test-stick {
  text-align: center;
}
.test-stick h4 {
  margin: 0 0 12px;
  font-size: 14px;
  font-weight: 500;
}
.stick-map {
  width: min(160px, 100%);
  aspect-ratio: 1;
  position: relative;
  border: 1px solid #ffffff30;
  border-radius: 12px;
  margin: auto;
  background:
    linear-gradient(
      transparent calc(50% - 0.5px),
      #ffffff15 50%,
      transparent calc(50% + 0.5px)
    ),
    linear-gradient(
      90deg,
      transparent calc(50% - 0.5px),
      #ffffff15 50%,
      transparent calc(50% + 0.5px)
    );
}
.stick-neutral,
.stick-threshold {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
}
.stick-neutral {
  background: #acd8ba20;
  border: 1px solid #acd8ba60;
}
.stick-threshold {
  border: 1px dashed #ffffff60;
}
.stick-dot {
  position: absolute;
  width: 12px;
  height: 12px;
  background: #e9dece;
  border-radius: 50%;
  transform: translate(-50%, -50%);
}
.test-stick output {
  display: block;
  margin-top: 10px;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.test-triggers {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin: 20px 0;
}
.test-triggers label {
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.test-triggers meter {
  display: block;
  width: 100%;
  height: 14px;
  margin: 6px 0;
}
.test-direction {
  font-size: 14px;
}
.test-deadzone span {
  flex: 1;
  font-size: 14px;
}
.testing .test-toolbar {
  margin: 12px 0;
}
.testing .test-sticks {
  margin-top: 16px;
}
.testing .stick-map {
  width: min(130px, 100%);
}
.testing .test-triggers,
.testing .test-deadzone {
  margin: 12px 0;
}
</style>
