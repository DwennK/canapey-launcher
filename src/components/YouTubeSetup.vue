<script setup lang="ts">
import { t } from '../lib/i18n';
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import * as api from '../lib/bridge';
import type { AppEntry } from '../lib/types';
const props = defineProps<{ native: boolean; saveApp: (app: AppEntry) => Promise<boolean>; openApp: (app: AppEntry) => Promise<void> }>();
const emit = defineEmits<{ busy: [value: boolean]; detected: [app: AppEntry | null] }>();
const installed = ref<AppEntry | null>(null), release = ref<api.VacuumTubeRelease | null>(null);
const loading = ref(false), installing = ref(false), opening = ref(false), error = ref(''), message = ref('');
const progress = ref<api.VacuumTubeProgress>({stage:'checking',received:0,total:0});
const percent = computed(() => progress.value.total ? Math.min(100, Math.floor(progress.value.received * 100 / progress.value.total)) : 0);
const stageLabel = computed(() => ({checking:t('Finding the latest stable version…'),downloading:t('Downloading…'),installing:t('Finish installation in Windows'),detecting:t('Checking installation…')})[progress.value.stage]);
const root = ref<HTMLElement | null>(null);
let stop = () => {}, alive = true;
async function focusAction() {
  await nextTick();
  root.value?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
}
async function refresh() {
  if (loading.value || installing.value) return;
  loading.value = true; error.value = ''; message.value = ''; release.value = null;
  try {
    installed.value = await api.detectYouTube();
    if (!alive) return;
    emit('detected', installed.value);
    if (!installed.value && props.native) release.value = await api.youtubeRelease();
  } catch (e) { error.value = String(e instanceof Error ? e.message : e); }
  finally { loading.value = false; }
}
async function install() {
  if (installing.value || !release.value || !props.native) return;
  installing.value = true; emit('busy', true); error.value = ''; message.value = '';
  progress.value = {stage:'checking',received:0,total:0};
  await focusAction();
  try {
    // Subscribe before invoking so fast downloads cannot miss their first state.
    stop = await api.youtubeProgress(value => { progress.value = value; });
    const app = await api.installYouTube();
    installed.value = app; emit('detected', app);
    if (!app) { message.value = t('Installation not detected. If you closed the installer, you can try again.'); return; }
    if (!(await props.saveApp(app))) throw new Error(t('YouTube is installed, but its card was not saved. Click Open to try again.'));
    message.value = t('YouTube is ready.');
  } catch (e) { error.value = String(e instanceof Error ? e.message : e); }
  finally { stop(); stop = () => {}; installing.value = false; emit('busy', false); await focusAction(); }
}
async function open() {
  if (!installed.value || opening.value) return;
  opening.value = true; error.value = '';
  try { await props.openApp(installed.value); } catch(e) { error.value = String(e instanceof Error ? e.message : e); }
  finally { opening.value = false; }
}
async function cancel() { try { await api.cancelYouTubeInstall(); message.value = t('Cancelling download…'); } catch(e) { error.value = String(e); } }
onMounted(() => void refresh());
onUnmounted(() => { alive = false; stop(); });
</script>
<template>
  <div ref="root" class="youtube-setup">
    <div class="youtube-preview"><img src="/art/youtube-card.webp" alt="" /><img class="youtube-logo" src="/brands/youtube.svg" alt="YouTube" /></div>
    <div class="youtube-details">
      <p class="youtube-intro">{{ t('YouTube on your TV, built for a controller.') }}</p>
      <p v-if="loading" role="status">{{ t('Looking for YouTube on this PC…') }}</p>
      <template v-else-if="installing">
        <p role="status">{{ stageLabel }}</p>
        <template v-if="progress.stage === 'downloading'"><progress :value="percent" max="100" :aria-label="t('YouTube download')" /><p class="note">{{ percent }} % · {{ Math.round(progress.received / 1048576) }} / {{ Math.round(progress.total / 1048576) }} {{ t('MB') }}</p></template>
        <p v-if="progress.stage === 'installing'" class="note">{{ t('The Windows installer is open. Complete or cancel installation there.') }}</p>
        <button v-if="['checking','downloading'].includes(progress.stage)" class="small-button" @click="cancel">{{ t('Cancel download') }}</button>
      </template>
      <template v-else>
        <p v-if="installed" class="note">{{ t('Already installed on this PC. Your account and settings are preserved.') }}</p>
        <p v-else-if="release" class="note">{{ t('Stable version') }} {{ release.version }} · {{ Math.ceil(release.size / 1048576) }} {{ t('MB') }}<br />{{ t('The Windows installer will open after the download.') }}</p>
        <p v-else-if="!native" class="note">{{ t('Installation is available in Canapey on Windows.') }}</p>
        <div class="youtube-actions">
          <button v-if="installed" class="primary-button" :disabled="opening" @click="open">{{ opening ? t('Opening…') : t('Open YouTube') }}</button>
          <button v-else class="primary-button" :disabled="!native || !release" @click="install">{{ t('Install YouTube') }}</button>
          <button v-if="native" class="small-button" :disabled="opening" @click="refresh">{{ t('Check again') }}</button>
        </div>
      </template>
      <p v-if="error" class="inline-error" role="alert">{{ error }}</p>
      <p v-if="message" role="status">{{ message }}</p>
    </div>
  </div>
</template>
<style scoped>
.youtube-setup { display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:32px;align-items:center;padding:12px 0 24px; }
.youtube-preview { position:relative;aspect-ratio:16/9;border-radius:12px;overflow:hidden; }
.youtube-preview > img:first-child { width:100%;height:100%;object-fit:cover;filter:brightness(.8); }
.youtube-logo { position:absolute;left:32%;top:28%;width:36%;height:44%;object-fit:contain; }
.youtube-intro { font-size:24px;line-height:1.4;margin:0 0 20px; }
.youtube-details { min-width:0;font-size:18px;line-height:1.6; }
.youtube-actions { display:flex;gap:12px;flex-wrap:wrap;margin-top:24px; }
progress { width:100%;height:12px;accent-color:#e9dfce; }
@media(max-width:700px) { .youtube-setup { grid-template-columns:1fr;gap:20px; }.youtube-intro{font-size:20px;}.youtube-details{font-size:16px;} }
</style>
