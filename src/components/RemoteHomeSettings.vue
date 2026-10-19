<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import type { AppEntry, RemoteAction, RemoteBinding, RemoteShortcut } from '../lib/types';
import { captureShortcut, isMediaShortcut, onRemoteCapture, remoteHomeStatus, setRemoteCapture, shortcutLabel, validRemoteShortcut, type RemoteHomeStatus } from '../lib/remote-home';
import { actionLabel, remoteActions, remoteButtons, sameShortcut, type RemoteButton } from '../lib/remote-layout';

const props = defineProps<{ native: boolean; bindings: RemoteBinding[]; apps: AppEntry[]; saveBindings: (bindings: RemoteBinding[]) => Promise<boolean> }>();
const emit = defineEmits<{ capturing: [value: boolean] }>();
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
async function refresh() { if (props.native) status.value = await remoteHomeStatus(); }
async function stopCapture() {
  generation++; listening.value = false; emit('capturing', false); clearTimeout(timer);
  if (props.native) await setRemoteCapture(false);
}
function cancelCapture(text = 'Écoute arrêtée. Le réglage enregistré est conservé.') {
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
    timer = setTimeout(() => cancelCapture('Aucune touche reçue. Programmez ce bouton dans Flirc, puis réessayez.'), 15000);
  } catch (e) { error.value = String(e); }
  finally { busy.value = false; }
}
function received(value: RemoteShortcut) {
  if (!listening.value) return;
  key.value = value; error.value = ''; message.value = 'Touche reçue. Choisissez son action et enregistrez.';
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
function blur() { if (listening.value) cancelCapture('Écoute interrompue : revenez dans Canapey pour réessayer.'); }
function changeAction() { if (!globalAllowed.value) global.value = false; }
async function save(remove = false) {
  if (busy.value) return;
  error.value = ''; message.value = '';
  if (!remove) {
    if (!key.value) { error.value = 'Appuyez d’abord sur « Apprendre la touche ».'; return; }
    if (conflict.value) { error.value = `Cette touche est déjà attribuée à « ${label(conflict.value.button)} ». Programmez une touche distincte dans Flirc ou retirez cette association.`; return; }
    if (!global.value && isMediaShortcut(key.value)) { error.value = 'Activez le mode global pour remplacer l’action Windows de cette touche multimédia.'; return; }
    if (global.value && !validRemoteShortcut(key.value)) { error.value = 'Cette touche est réservée par le système ou n’est pas prise en charge. Choisissez une autre touche.'; return; }
    if (action.value === 'launch' && !appId.value) { error.value = 'Choisissez une application.'; return; }
  }
  busy.value = true;
  try {
    await stopCapture();
    const bindings = props.bindings.filter(b => b.button !== selected.value);
    if (!remove) bindings.push({button: selected.value, key: key.value!, action: action.value, global: global.value && globalAllowed.value, appId: action.value === 'launch' ? appId.value : null});
    if (!(await props.saveBindings(bindings))) { error.value = 'Enregistrement impossible. Les associations précédentes sont conservées. Vérifiez le message affiché.'; return; }
    await refresh(); loadDraft();
    message.value = remove ? 'Association retirée.' : 'Association enregistrée.';
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
    <header class="remote-heading">
      <div><slot name="title"><h3 id="remote-title">Télécommande</h3></slot><p>Un bouton, une action. Même en dehors de Canapey.</p></div>
      <span class="remote-count">{{ bindings.length }} associé{{ bindings.length > 1 ? 's' : '' }}</span>
    </header>
    <button class="remote-photo-toggle small-button" :aria-expanded="photoExpanded" aria-controls="remote-device" @click="photoExpanded = !photoExpanded">{{ photoExpanded ? 'Masquer la télécommande' : 'Choisir sur la télécommande' }}</button>
    <div class="remote-workspace">
      <div id="remote-device" class="remote-photo-column" :class="{expanded: photoExpanded}">
        <span class="remote-device-name">SKIP 1S</span>
        <div class="remote-mode" aria-label="Mode de la couronne">
          <button :class="{active: !colors}" :aria-pressed="!colors" @click="colors = false">Navigation</button>
          <button :class="{active: colors}" :aria-pressed="colors" @click="colors = true">Couleurs</button>
        </div>
        <div class="remote-photo" aria-label="Télécommande Skip 1s">
          <img src="/devices/skip-1s.png" alt="Télécommande Skip 1s vue de face" width="1000" height="1000" draggable="false" />
          <button v-for="b in visibleButtons" :key="b.id" class="remote-hotspot" :class="{selected: selected === b.id, mapped: bindings.some(m => m.button === b.id), hardware: b.hardware, listening: listening && selected === b.id}" :style="position(b)" :aria-label="`Configurer ${b.label}`" :aria-pressed="selected === b.id" :title="b.label" :disabled="busy" @click="choose(b.id)"><span v-if="b.color" class="color-dot" :style="{background: {red:'#dd4242',green:'#42c76a',blue:'#269fd8',yellow:'#e4d83d'}[b.color]}" aria-hidden="true"></span></button>
        </div>
        <span class="remote-photo-caption">Choisissez un bouton sur la photo.</span>
      </div>
      <div ref="inspector" class="remote-inspector">
        <div class="remote-step-heading"><span aria-hidden="true">1</span><h4>Choisir et apprendre le bouton</h4></div>
        <label class="remote-field remote-button-picker"><span>Bouton</span><select :value="selected" :disabled="busy" @change="choose(($event.target as HTMLSelectElement).value)"><option v-for="b in remoteButtons" :key="b.id" :value="b.id">{{ b.label }}{{ bindings.some(m => m.button === b.id) ? ' · associé' : '' }}</option></select></label>
        <template v-if="button.hardware">
          <p class="remote-explanation">{{ button.hardware }}</p>
          <button v-if="selected === 'colors'" class="small-button" @click="choose('red')">Associer les touches de couleur</button>
        </template>
        <template v-else>
          <div class="remote-signal" :class="{listening}">
            <div class="remote-signal-value"><span class="remote-label">{{ listening ? 'À l’écoute…' : 'Touche reçue' }}</span><kbd>{{ listening ? 'Appuyez sur ce bouton' : key ? shortcutLabel(key) : 'À apprendre' }}</kbd></div>
            <button v-if="listening" class="small-button" @click="cancelCapture()">Annuler l’écoute</button><button v-else class="small-button" :disabled="busy || (native && !status?.available)" @click="beginCapture">{{ key ? 'Réapprendre la touche' : 'Apprendre la touche' }}</button>
          </div>
          <p v-if="listening" class="remote-listening-help" role="status">Appuyez sur votre télécommande dans les 15 secondes.</p>
          <div class="remote-step-heading remote-action-heading"><span aria-hidden="true">2</span><h4>Choisir l’action</h4></div>
          <label class="remote-field remote-action-picker"><span>Action</span><select v-model="action" :disabled="busy || listening" @change="changeAction"><optgroup v-for="group in groups" :key="group" :label="group"><option v-for="a in remoteActions.filter(a => a.group === group)" :key="a.id" :value="a.id">{{ a.label }}</option></optgroup></select></label>
          <label v-if="action === 'launch'" class="remote-field remote-app-picker"><span>Application</span><select v-model="appId" :disabled="busy || listening"><option :value="null">Choisir une application</option><option v-if="appId && !apps.some(a => a.id === appId)" :value="appId">Application retirée — choisissez-en une autre</option><option v-for="app in apps" :key="app.id" :value="app.id">{{ app.name }}</option></select><small v-if="!apps.length">Ajoutez d’abord des applications à votre bibliothèque.</small></label>
          <label v-if="globalAllowed" class="remote-scope"><span>Activer dans tout Windows<small>{{ global ? 'Fonctionne aussi lorsque Canapey est en arrière-plan.' : 'Fonctionne uniquement dans Canapey.' }}</small></span><input v-model="global" type="checkbox" role="switch" :disabled="busy || listening" /></label>
          <p v-if="global" class="remote-scope-note">La même touche de votre clavier déclenchera aussi cette action.</p>
          <p v-if="conflict" class="remote-error" role="alert">Touche déjà associée au bouton « {{ label(conflict.button) }} ».</p>
          <div class="remote-save-actions"><button class="primary" :disabled="busy || listening || !key || !!conflict" @click="save()">Enregistrer</button><button v-if="saved" class="small-button remote-remove" :disabled="busy || listening" @click="save(true)">Retirer l’association</button></div>
          <p v-if="saved" class="remote-saved">{{ actionLabel(saved.action) }} · {{ saved.global ? (!native ? 'Aperçu global' : status?.active.some(b => b.button === saved?.button) ? 'Global actif' : 'Global inactif') : 'Dans Canapey' }}</p>
        </template>
        <p v-if="error || status?.error" class="remote-error" role="alert">{{ error || status?.error }}</p>
        <p v-if="message" class="remote-message" role="status">{{ message }}</p>
        <details class="remote-help"><summary>Comment fonctionne l’association ?</summary><p>Appuyez sur la télécommande ou un clavier : Canapey apprend la touche reçue et lui affecte votre action, sans dépendre du récepteur utilisé. Flèches, lettres, chiffres et touches multimédias sont acceptés lorsque Windows peut les réserver.</p><p>Canapey signale les raccourcis déjà occupés. Un bouton qui n’envoie aucune touche doit d’abord être configuré dans le logiciel de votre récepteur.</p><p>Les mêmes touches du clavier physique déclenchent aussi ces actions. La sélection A/B/C et le passage en mode couleurs restent gérés par la Skip 1s.</p></details>
        <p v-if="!native" class="remote-preview">Aperçu interactif. Les actions Windows nécessitent l’application installée.</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
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
</style>
