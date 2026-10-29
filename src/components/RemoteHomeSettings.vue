<script setup lang="ts">
import { t } from '../lib/i18n';
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import type { AppEntry, RemoteAction, RemoteBinding, RemoteShortcut } from '../lib/types';
import { captureShortcut, isMediaShortcut, onRemoteCapture, remoteHomeStatus, setRemoteCapture, shortcutLabel, validRemoteShortcut, type RemoteHomeStatus } from '../lib/remote-home';
import { actionLabel, remoteActions, remoteButtons, sameShortcut, type RemoteButton } from '../lib/remote-layout';

const props = defineProps<{ native: boolean; bindings: RemoteBinding[]; apps: AppEntry[]; saveBindings: (bindings: RemoteBinding[]) => Promise<boolean> }>();
const emit = defineEmits<{ capturing: [value: boolean] }>();
const essentials = ['home', 'up', 'down', 'left', 'right', 'ok', 'back', 'volumeUp', 'volumeDown', 'mute'];
const guided = ref(false), guideIndex = ref(0), guideFinished = ref(false);
const configuredEssentials = computed(() => essentials.filter(id => props.bindings.some(binding => binding.button === id)).length);
const guideAction = computed(() => actionLabel(button.value.action));
const selected = ref('home'), colors = ref(false), photoExpanded = ref(false);
const button = computed(() => remoteButtons.find(b => b.id === selected.value)!);
const saved = computed(() => props.bindings.find(b => b.button === selected.value));
const action = ref<RemoteAction>('home'), global = ref(true), appId = ref<string | null>(null), key = ref<RemoteShortcut | null>(null);
const listening = ref(false), busy = ref(false), error = ref(''), message = ref('');
const status = ref<RemoteHomeStatus | null>(null);
const inspector = ref<HTMLElement>();
const globalAllowed = computed(() => !!remoteActions.find(a => a.id === action.value)?.global);
const conflict = computed(() => key.value ? props.bindings.find(b => b.button !== selected.value && sameShortcut(b.key, key.value!)) : undefined);
const visibleButtons = computed(() => remoteButtons.filter(b => b.color ? colors.value : !(colors.value && ['up','down','left','right'].includes(b.id))));
const groups = [...new Set(remoteActions.map(action => action.group))];
let timer: ReturnType<typeof setTimeout> | undefined, stopEvents: (() => void) | undefined;
let disposed = false, generation = 0, swallowUntil = 0;
function label(id: string) { return remoteButtons.find(b => b.id === id)?.label ?? id; }
function loadDraft() {
  action.value = saved.value?.action ?? button.value.action;
  global.value = saved.value?.global ?? !!remoteActions.find(a => a.id === action.value)?.global;
  appId.value = saved.value?.appId ?? null;
  key.value = saved.value?.key ?? null;
}
function position(b: RemoteButton) {
  return { left: `${(b.x-380)/240*100}%`, top: `${(b.y-40)/920*100}%`, width: `${b.w/240*100}%`, height: `${b.h/920*100}%` };
}
async function startGuide() {
  guideFinished.value = false;
  guided.value = true;
  const next = essentials.findIndex(id => !props.bindings.some(binding => binding.button === id));
  guideIndex.value = Math.max(0, next);
  await guideStep(guideIndex.value);
}
async function guideStep(index: number) {
  if (busy.value) return;
  if (index >= essentials.length) {
    await leaveGuide(); guideFinished.value = true; return;
  }
  guideIndex.value = Math.max(0, index);
  await choose(essentials[guideIndex.value]!, false);
  action.value = button.value.action;
  appId.value = null;
  await nextTick();
  inspector.value?.querySelector<HTMLButtonElement>('[data-learn]')?.focus({ preventScroll: true });
  const scroller = inspector.value?.closest('.settings-content');
  if (scroller) scroller.scrollTop = 0;
}
async function leaveGuide() {
  await stopCapture(); guided.value = false; loadDraft();
  await nextTick();
  inspector.value?.closest('.remote-config')?.querySelector<HTMLButtonElement>('[data-start-guide]')?.focus();
}
async function refresh() { if (props.native) status.value = await remoteHomeStatus(); }
async function stopCapture() {
  generation++; listening.value = false; emit('capturing', false); clearTimeout(timer);
  if (props.native) await setRemoteCapture(false);
}
function cancelCapture(text = t('Listening stopped. The saved mapping is preserved.')) {
  void stopCapture().catch(e => error.value = String(e));
  message.value = text;
}
async function choose(id: string, learn = true) {
  if (busy.value) return;
  await stopCapture().catch(e => error.value = String(e));
  selected.value = id;
  const b = button.value;
  if (b.color || id === 'colors') colors.value = true;
  else if (['up','down','left','right'].includes(id)) colors.value = false;
  error.value = ''; message.value = ''; loadDraft();
  await nextTick();
  if (window.innerWidth < 700) inspector.value?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  if (learn && !saved.value && !b.hardware) await beginCapture();
}
async function beginCapture() {
  if (busy.value || listening.value || button.value.hardware) return;
  error.value = ''; message.value = ''; busy.value = true;
  const request = ++generation;
  try {
    if (props.native) await setRemoteCapture(true);
    if (disposed || request !== generation) { if (props.native) await setRemoteCapture(false); return; }
    listening.value = true; emit('capturing', true);
    timer = setTimeout(() => cancelCapture(t('No key received. Program this button in Flirc, then try again.')), 15000);
  } catch (e) { error.value = String(e); }
  finally { busy.value = false; }
}
function received(value: RemoteShortcut) {
  if (!listening.value) return;
  key.value = value; error.value = ''; message.value = t('Key received. Choose an action and save.');
  listening.value = false; emit('capturing', false); clearTimeout(timer); swallowUntil = Date.now() + 500;
  // Keep native capture leased briefly so held, already-registered buttons cannot exit the editor.
}
function keydown(event: KeyboardEvent) {
  if (!listening.value) return;
  event.preventDefault(); event.stopImmediatePropagation();
  try { const value = captureShortcut(event, false); if (value) received(value); }
  catch (e) { error.value = (e as Error).message; }
}
function keyup(event: KeyboardEvent) {
  if (listening.value || Date.now() < swallowUntil) { event.preventDefault(); event.stopImmediatePropagation(); }
}
function blur() { if (listening.value) cancelCapture(t('Listening interrupted: return to Canapey and try again.')); }
function changeAction() { if (!globalAllowed.value) global.value = false; }
async function save(remove = false) {
  if (busy.value) return;
  error.value = ''; message.value = '';
  if (!remove) {
    if (!key.value) { error.value = t('Press “Learn key” first.'); return; }
    if (conflict.value) { error.value = t('This key is already assigned to “{0}”. Program a different key in Flirc or remove that mapping.', [label(conflict.value.button)]); return; }
    if (!global.value && isMediaShortcut(key.value)) { error.value = t('Enable global mode to override the Windows action for this media key.'); return; }
    if (global.value && !validRemoteShortcut(key.value)) { error.value = t('This key is reserved by the system or is unsupported. Choose another key.'); return; }
    if (action.value === 'launch' && !appId.value) { error.value = t('Choose an app.'); return; }
  }
  busy.value = true;
  try {
    await stopCapture();
    const bindings = props.bindings.filter(b => b.button !== selected.value);
    if (!remove) bindings.push({button: selected.value, key: key.value!, action: action.value, global: global.value && globalAllowed.value, appId: action.value === 'launch' ? appId.value : null});
    if (!(await props.saveBindings(bindings))) { error.value = t('Could not save. Previous mappings are preserved. Check the message shown.'); return; }
    await refresh(); loadDraft();
    message.value = remove ? t('Mapping removed.') : t('Mapping saved.');
    if (guided.value && !remove) { busy.value = false; await guideStep(guideIndex.value + 1); }
  } catch (e) { error.value = String(e); }
  finally { busy.value = false; }
}
onMounted(async () => {
  loadDraft();
  window.addEventListener('keydown', keydown, true); window.addEventListener('keyup', keyup, true); window.addEventListener('blur', blur);
  try {
    if (props.native) { const stop = await onRemoteCapture(received); if (disposed) { stop(); return; } stopEvents = stop; await refresh(); }
  } catch (e) { error.value = String(e); }
});
onUnmounted(() => {
  disposed = true; clearTimeout(timer); stopEvents?.();
  window.removeEventListener('keydown', keydown, true); window.removeEventListener('keyup', keyup, true); window.removeEventListener('blur', blur);
  void stopCapture().catch(() => {});
});
</script>

<template>
  <section class="remote-config" aria-labelledby="remote-title">
    <header v-if="!guided" class="remote-heading">
      <div><slot name="title"><h3 id="remote-title">{{ t('Remote') }}</h3></slot><p>{{ t('One button, one action. Even outside Canapey.') }}</p></div>
      <span class="remote-count">{{ t('{0} mapped', [bindings.length]) }}</span>
    </header>
    <div class="remote-guide" :class="{ guided }">
      <template v-if="guided">
        <p class="guide-progress" role="status">{{ t('Button') }} {{ guideIndex + 1 }} {{ t('of') }} {{ essentials.length }} · {{ configuredEssentials }} {{ t('mapped') }}</p>
        <h4>{{ label(essentials[guideIndex]!) }}</h4><p>{{ t('Learn the key, then save to continue.') }}</p>

      </template>
      <template v-else>
        <h4>{{ guideFinished ? t('Setup complete') : t('Essential buttons') }}</h4><p>{{ configuredEssentials }} {{ t('of') }} {{ essentials.length }} {{ t('buttons mapped · home, navigation and volume.') }}</p>
        <p v-if="guideFinished" role="status">{{ configuredEssentials === essentials.length ? t('All essential buttons are configured.') : t('Skipped buttons still need configuring. Your saved mappings are preserved.') }}</p>
        <button data-start-guide class="small-button" :disabled="busy" @click="startGuide">{{ configuredEssentials ? t('Resume guided setup') : t('Set up essential buttons') }}</button>
      </template>
    </div>
    <div v-if="!guided && bindings.length" class="remote-summary" :aria-label="t('Mapped buttons')"><button v-for="binding in bindings" :key="binding.button" class="small-button" :disabled="busy" @click="choose(binding.button, false)">{{ label(binding.button) }} · {{ actionLabel(binding.action) }}</button></div>
    <button v-if="!guided" class="remote-photo-toggle small-button" :aria-expanded="photoExpanded" aria-controls="remote-device" @click="photoExpanded = !photoExpanded">{{ photoExpanded ? t('Hide remote') : t('Choose on the remote') }}</button>
    <div class="remote-workspace" :class="{ guided }">
      <div v-if="!guided" id="remote-device" class="remote-photo-column" :class="{expanded: photoExpanded}">
        <span class="remote-device-name">SKIP 1S</span>
        <div class="remote-mode" :aria-label="t('Ring mode')">
          <button :class="{active: !colors}" :aria-pressed="!colors" @click="colors = false">{{ t('Navigation') }}</button>
          <button :class="{active: colors}" :aria-pressed="colors" @click="colors = true">{{ t('Colors') }}</button>
        </div>
        <div class="remote-photo" :aria-label="t('Skip 1s remote')">
          <img src="/devices/skip-1s.png" :alt="t('Front view of the Skip 1s remote')" width="1000" height="1000" draggable="false" />
          <button v-for="b in visibleButtons" :key="b.id" class="remote-hotspot" :class="{selected: selected === b.id, mapped: bindings.some(m => m.button === b.id), hardware: b.hardware, listening: listening && selected === b.id}" :style="position(b)" :aria-label="t('Configure {0}', [b.label])" :aria-pressed="selected === b.id" :title="b.label" :disabled="busy" @click="choose(b.id)"><span v-if="b.color" class="color-dot" :style="{background: {red:'#dd4242',green:'#42c76a',blue:'#269fd8',yellow:'#e4d83d'}[b.color]}" aria-hidden="true"></span></button>
        </div>
        <span class="remote-photo-caption">{{ t('Choose a button on the photo.') }}</span>
      </div>
      <div ref="inspector" class="remote-inspector">
        <div v-if="!guided" class="remote-step-heading"><span aria-hidden="true">1</span><h4>{{ t('Choose and learn a button') }}</h4></div>
        <label v-if="!guided" class="remote-field remote-button-picker"><span>{{ t('Button') }}</span><select :value="selected" :disabled="busy" @change="choose(($event.target as HTMLSelectElement).value)"><option v-for="b in remoteButtons" :key="b.id" :value="b.id">{{ b.label }}{{ bindings.some(m => m.button === b.id) ? t(' · mapped') : '' }}</option></select></label>
        <template v-if="button.hardware">
          <p class="remote-explanation">{{ button.hardware }}</p>
          <button v-if="selected === 'colors'" class="small-button" @click="choose('red')">{{ t('Map the color buttons') }}</button>
        </template>
        <template v-else>
          <div class="remote-signal" :class="{listening}">
            <div class="remote-signal-value"><span class="remote-label">{{ listening ? t('Listening…') : t('Key received') }}</span><kbd>{{ listening ? t('Press this button') : key ? shortcutLabel(key) : t('Not learned yet') }}</kbd></div>
            <button v-if="listening" class="small-button" @click="cancelCapture()">{{ t('Cancel listening') }}</button><button v-else data-learn class="small-button" :disabled="busy || (native && !status?.available)" @click="beginCapture">{{ key ? t('Relearn key') : t('Learn key') }}</button>
          </div>
          <p v-if="listening" class="remote-listening-help" role="status">{{ t('Press your remote button within 15 seconds.') }}</p>
          <p v-if="guided" class="guide-action">{{ t('Action:') }} <strong>{{ guideAction }}</strong></p><div v-if="!guided" class="remote-step-heading remote-action-heading"><span aria-hidden="true">2</span><h4>{{ t('Choose an action') }}</h4></div>
          <label v-if="!guided" class="remote-field remote-action-picker"><span>{{ t('Action') }}</span><select v-model="action" :disabled="busy || listening" @change="changeAction"><optgroup v-for="group in groups" :key="group" :label="group"><option v-for="a in remoteActions.filter(a => a.group === group)" :key="a.id" :value="a.id">{{ a.label }}</option></optgroup></select></label>
          <label v-if="action === 'launch'" class="remote-field remote-app-picker"><span>{{ t('App') }}</span><select v-model="appId" :disabled="busy || listening"><option :value="null">{{ t('Choose an app') }}</option><option v-if="appId && !apps.some(a => a.id === appId)" :value="appId">{{ t('App removed — choose another') }}</option><option v-for="app in apps" :key="app.id" :value="app.id">{{ app.name }}</option></select><small v-if="!apps.length">{{ t('Add apps to your library first.') }}</small></label>
          <label v-if="globalAllowed" class="remote-scope"><span>{{ t('Enable throughout Windows') }}<small>{{ global ? t('Also works while Canapey is in the background.') : t('Works only in Canapey.') }}</small></span><input v-model="global" type="checkbox" role="switch" :disabled="busy || listening" /></label>
          <p v-if="global && ['accept', 'up', 'down', 'left', 'right', 'back'].includes(action)" class="remote-scope-note">{{ t('Controls the active app: OK sends Enter, Back sends Escape. Only Home returns to Canapey.') }}</p>
          <p v-if="global" class="remote-scope-note">{{ t('The same key on your keyboard will also trigger this action.') }}</p>
          <p v-if="conflict" class="remote-error" role="alert">{{ t('Key already mapped to button “{0}”.', [label(conflict.button)]) }}</p>
          <div class="remote-save-actions"><button class="primary" :disabled="busy || listening || !key || !!conflict" @click="save()">{{ guided ? t('Save and continue') : t('Save') }}</button><button v-if="saved && !guided" class="small-button remote-remove" :disabled="busy || listening" @click="save(true)">{{ t('Remove mapping') }}</button></div>
          <p v-if="saved" class="remote-saved">{{ actionLabel(saved.action) }} · {{ saved.global ? (!native ? t('Global preview') : status?.active.some(b => b.button === saved?.button) ? t('Global active') : t('Global inactive')) : t('In Canapey') }}</p>
        </template>
        <div v-if="guided" class="guide-actions"><button class="small-button" :disabled="busy || guideIndex === 0" @click="guideStep(guideIndex - 1)">{{ t('Previous') }}</button><button class="small-button" :disabled="busy" @click="guideStep(guideIndex + 1)">{{ t('Skip this button') }}</button><button class="text-button" :disabled="busy" @click="leaveGuide">{{ t('Exit guide') }}</button></div>
        <p v-if="error || status?.error" class="remote-error" role="alert">{{ error || status?.error }}</p>
        <p v-if="message" class="remote-message" role="status">{{ message }}</p>
        <details v-if="!guided" class="remote-help"><summary>{{ t('How does mapping work?') }}</summary><p>{{ t('Press a remote button or keyboard key: Canapey learns the key received and assigns your action, regardless of the receiver. Arrows, letters, numbers and media keys are accepted when Windows can reserve them.') }}</p><p>{{ t('Canapey reports shortcuts that are already in use. A button that sends no key must first be configured in your receiver’s software.') }}</p><p>{{ t('The same physical keyboard keys also trigger these actions. A/B/C activity selection and color mode remain managed by the Skip 1s.') }}</p></details>
        <p v-if="!native" class="remote-preview">{{ t('Interactive preview. Windows actions require the installed app.') }}</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.remote-guide.guided { padding: 0 0 12px; margin-bottom: 16px; }
.guide-actions { margin-top: 20px; }

.remote-guide { padding: 20px 0 24px; margin-bottom: 24px; border-bottom: 1px solid #ffffff20; }
.remote-guide h4 { font-size: 22px; margin: 0 0 10px; }
.remote-guide p { color: #c2c7cf; font-size: 16px; line-height: 1.6; margin: 8px 0 16px; }
.remote-guide .guide-progress { color: #e9dfce; font-size: 14px; }
.guide-actions, .remote-summary { display: flex; flex-wrap: wrap; gap: 12px; }
.remote-summary { margin-bottom: 24px; }
.remote-summary button { text-align: left; white-space: normal; }
.remote-workspace.guided { display: block; }
.guide-action { font-size: 18px; line-height: 1.6; }

.remote-config { min-width: 0; }
.remote-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 18px; }
.remote-heading h3 { margin: 0; font-size: 23px; font-weight: 500; letter-spacing: -.5px; }
.remote-heading p { margin: 7px 0 0; font-size: 12px; color: #a3a9b3; line-height: 1.6; }
.remote-count { color: #c7bcaa; background: #e9dfce0b; border: 1px solid #e9dfce14; padding: 6px 9px; border-radius: 7px; white-space: nowrap; font-size: 10px; }
.remote-workspace { display: grid; grid-template-columns: 160px minmax(0, 1fr); gap: 28px; align-items: start; }
.remote-photo-column { display: flex; flex-direction: column; align-items: center; gap: 10px; }
.remote-device-name { font-size: 9px; letter-spacing: 2px; color: #8e96a2; }
.remote-mode { display: flex; background: #ffffff07; padding: 3px; border-radius: 7px; }
.remote-mode button { padding: 7px 9px; font-size: 10px; color: #9fa5ae; border-radius: 5px; }
.remote-mode button.active { color: #f4ede1; background: #ffffff13; }
.remote-photo { position: relative; height: 350px; aspect-ratio: 240 / 920; overflow: hidden; border-radius: 14px; background: white; flex-shrink: 0; }
.remote-photo img { position: absolute; width: 416.6667%; max-width: none; height: auto; left: -158.3333%; top: -4.3478%; user-select: none; pointer-events: none; }
.remote-hotspot { position: absolute; transform: translate(-50%, -50%); border-radius: 50%; border: 2px solid transparent; background: transparent; padding: 0; transition: border-color 140ms, background 140ms, box-shadow 140ms; }
.remote-hotspot:hover { border-color: #e9dfceb3; background: #e9dfce26; }
.remote-hotspot.selected, .remote-hotspot:focus-visible { border-color: #fff1d3; box-shadow: 0 0 0 2px #796d56; background: #e9dfce26; outline: none; }
.remote-hotspot.mapped::after { content: ''; position: absolute; right: -2px; top: -2px; width: 5px; height: 5px; border-radius: 50%; background: #d5c6aa; box-shadow: 0 0 0 1px #24211b; }
.remote-hotspot.hardware:hover { border-style: dashed; }.remote-hotspot.listening { animation: remote-pulse 1.2s ease-in-out infinite; }
.color-dot { display: block; width: 8px; height: 8px; border-radius: 50%; margin: auto; }
.remote-photo-caption { font-size: 9px; line-height: 1.6; text-align: center; color: #929aa6; }
.remote-photo-toggle { display: none; }
.remote-inspector { min-width: 0; scroll-margin-top: 12px; }
.remote-step-heading { display: flex; align-items: center; gap: 9px; margin-bottom: 10px; }
.remote-step-heading > span { display: grid; place-items: center; width: 22px; height: 22px; border: 1px solid #e9dfce25; border-radius: 50%; color: #d5c6aa; font-size: 10px; flex-shrink: 0; }
.remote-step-heading h4 { margin: 0; font-weight: 500; font-size: 13px; color: #eee8de; }
.remote-action-heading { margin-top: 18px; }
.remote-field { display: flex; flex-direction: column; gap: 7px; margin-bottom: 12px; }
.remote-field > span, .remote-label { color: #a3a9b3; font-size: 10px; }
.remote-field select { width: 100%; min-width: 0; max-width: 100%; font-size: 12px; padding: 11px 12px; }
.remote-field small { font-size: 11px; color: #9da6b1; line-height: 1.7; }
.remote-button-picker > span, .remote-action-picker > span { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.remote-app-picker { display: grid; grid-template-columns: 75px minmax(0, 1fr); align-items: center; gap: 8px; }
.remote-app-picker small { grid-column: 1 / -1; }
.remote-button-picker select { font-size: 14px; color: #f0f0ee; }
.remote-signal { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 68px; padding: 12px; border: 1px solid #ffffff0c; border-radius: 10px; background: #13161c; }
.remote-signal-value { min-width: 0; }
.remote-signal kbd { display: block; border: 0; padding: 0; margin-top: 5px; font-size: 12px; height: auto; line-height: 1.5; color: #eee8de; background: none; white-space: normal; overflow-wrap: anywhere; }
.remote-signal .small-button { flex-shrink: 0; font-size: 10px; padding: 9px 10px; }
.remote-signal.listening { border-color: #d5c6aa80; background: #d5c6aa0a; }
.remote-listening-help { margin: 7px 0 0; font-size: 11px; color: #d5c6aa; line-height: 1.6; }
.remote-scope { display: flex; gap: 13px; align-items: center; justify-content: space-between; margin: 12px 0 0; font-size: 12px; line-height: 1.5; }
.remote-scope small { display: block; font-size: 10px; color: #9da6b1; margin-top: 4px; }
.remote-scope input { flex-shrink: 0; }
.remote-scope-note { font-size: 10px; line-height: 1.6; color: #a3a9b3; margin: 9px 0 0; }
.remote-save-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 14px; }
.remote-save-actions button { white-space: normal; font-size: 12px; padding: 11px 16px; border-radius: 8px; }
.remote-save-actions .primary { background: #e8decd; color: #24211b; font-weight: 600; }
.remote-save-actions .primary:disabled { opacity: .35; }
.remote-save-actions .remote-remove { background: none; border-color: transparent; color: #aeb5bf; padding-inline: 10px; font-size: 10px; }
.remote-saved, .remote-message { font-size: 11px; color: #b9cdbd; line-height: 1.6; margin: 10px 0 0; }
.remote-error { color: #f0b5a5; font-size: 12px; line-height: 1.7; white-space: pre-line; margin: 10px 0 0; }
.remote-help { margin-top: 20px; border-top: 1px solid #ffffff10; padding-top: 14px; font-size: 11px; line-height: 1.8; color: #9fa8b5; }
.remote-help summary { cursor: pointer; color: #b9bec7; }.remote-help p { margin: 10px 0 0; }
.remote-preview { font-size: 10px; line-height: 1.7; color: #8e98a6; margin: 12px 0 0; }
.remote-explanation { font-size: 13px; color: #aeb5bf; line-height: 1.8; }
@keyframes remote-pulse { 50% { box-shadow: 0 0 0 5px #d5c6aa40; } }
@media (prefers-reduced-motion: reduce) { .remote-hotspot { animation: none !important; transition: none; } }
@media (max-width: 1050px) { .remote-workspace { grid-template-columns: 135px minmax(0, 1fr); gap: 20px; } }
@media (max-width: 700px) {
  .remote-heading { align-items: flex-start; margin-bottom: 16px; }.remote-heading h3 { font-size: 20px; }.remote-heading p { font-size: 11px; }
  .remote-workspace { grid-template-columns: minmax(0, 1fr); gap: 20px; }
  .remote-photo-toggle { display: block; margin-bottom: 20px; font-size: 11px; }
  .remote-photo-column { display: none; }.remote-photo-column.expanded { display: flex; padding-bottom: 16px; border-bottom: 1px solid #ffffff10; }
  .remote-photo { height: 420px; }.remote-photo-caption { font-size: 10px; }
  .remote-step-heading h4 { font-size: 12px; }
  .remote-signal { flex-wrap: wrap; }.remote-signal .small-button { flex-shrink: 1; }
}
.remote-heading p, .remote-field small, .remote-scope small, .remote-scope-note, .remote-help, .remote-preview, .remote-saved, .remote-message, .remote-error, .remote-listening-help { font-size: 14px; }
.remote-heading h3, .remote-step-heading h4 { font-size: 18px; }
.remote-field select, .remote-scope, .remote-signal kbd, .remote-save-actions button, .remote-signal .small-button { font-size: 16px; }
.remote-label, .remote-count, .remote-photo-caption { font-size: 13px; }
.remote-signal { min-height: 92px; }
.remote-photo { height: 440px; }
.remote-workspace { grid-template-columns: 150px minmax(0, 1fr); gap: 24px; }
.remote-config button:not(.remote-hotspot) { min-height: 44px; }
@media (max-width: 700px) { .remote-workspace { grid-template-columns: minmax(0, 1fr); }.remote-save-actions .primary { width: 100%; } }
</style>
