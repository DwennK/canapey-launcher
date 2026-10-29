<script setup lang="ts">
import { t } from '../lib/i18n';
import { computed, onMounted, onUnmounted, ref } from "vue";
import { cancelXboxTest, openGameBarSettings, testXboxButton, xboxHomeStatus, type XboxHomeStatus } from "../lib/xbox-home";

const props = defineProps<{ native: boolean }>();
const status = ref<XboxHomeStatus | null>(null);
const error = ref("");
const busy = ref(false);
let timer: ReturnType<typeof setTimeout> | undefined;
let disposed = false;
let ownTest = false;
const listening = computed(() => status.value?.test === "listening");
const message = computed(() => {
  if (!props.native) return t('The detection test requires Canapey on Windows.');
  if (error.value) return error.value;
  if (!status.value) return t('Checking Xbox detection…');
  if (status.value.test === "detected") return t('Xbox button detected. If Game Bar also opened, disable its shortcut below and repeat the test.');
  if (listening.value) return t('Release the Xbox button, then press it. Listening for 15 seconds without returning Home.');
  if (!status.value.available) return t('Xbox detection is unavailable on this PC. Choose a button combination above.');
  if (!status.value.connected) return t('Connect an Xbox-compatible controller to run the test.');
  if (status.value.test === "timeout") return t('No Xbox press received. Check Game Bar and Steam Input, then try again or choose a button combination.');
  return t('Test the Xbox button before using it to return Home.');
});

async function refresh() {
  try { status.value = await xboxHomeStatus(); }
  catch { error.value = t('Could not read Xbox detection. Reopen Settings to try again.'); }
  if (!disposed) timer = setTimeout(refresh, 350);
}
async function toggleTest() {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    if (listening.value) {
      await cancelXboxTest();
      ownTest = false;
      status.value = await xboxHomeStatus();
    } else {
      ownTest = true;
      status.value = await testXboxButton();
      if (disposed) await cancelXboxTest();
    }
  } catch (e) { error.value = String(e); }
  finally { busy.value = false; }
}
async function openSettings() {
  error.value = "";
  try { await openGameBarSettings(); }
  catch (e) { error.value = String(e); }
}
onMounted(() => { if (props.native) void refresh(); });
onUnmounted(() => {
  disposed = true;
  clearTimeout(timer);
  if (props.native && ownTest) void cancelXboxTest().catch(() => {});
});
</script>

<template>
  <section class="xbox-home-test" aria-labelledby="xbox-home-title">
    <h4 id="xbox-home-title">{{ t('Xbox button') }}</h4>
    <p class="note" role="status" aria-live="polite">{{ message }}</p>
    <button class="small-button" :disabled="!native || busy || (!listening && (!status?.available || !status?.connected))" @click="toggleTest">
      {{ listening ? t('Cancel Xbox test') : t('Test Xbox button') }}
    </button>
    <div class="xbox-windows-help">
      <h4>{{ t('Prevent Game Bar from opening') }}</h4>
      <p class="note">{{ t('In Windows settings, turn off the option that lets a controller open Game Bar. Canapey opens that setting; you choose whether to disable it. Game Bar remains accessible with Windows + G.') }}</p>
      <button class="small-button" :disabled="!native || listening" @click="openSettings">{{ t('Open Game Bar settings') }}</button>
    </div>
  </section>
</template>

<style scoped>
.xbox-home-test { margin: 16px 0 24px; padding: 20px; border: 1px solid #ffffff14; border-radius: 12px; background: #ffffff03; }
h4 { margin: 0 0 8px; font-size: 14px; font-weight: 500; }
.note { margin: 0 0 16px; }
.xbox-windows-help { margin-top: 22px; padding-top: 20px; border-top: 1px solid #ffffff14; }
button { max-width: 100%; white-space: normal; text-align: left; }
@media (max-width: 600px) { .xbox-home-test { padding: 16px; } }
</style>
