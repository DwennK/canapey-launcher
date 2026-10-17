<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import type { AppEntry, RemoteAction, RemoteBinding, RemoteShortcut } from '../lib/types';
import { captureShortcut, isMediaShortcut, onRemoteCapture, remoteHomeStatus, setRemoteCapture, shortcutLabel, validRemoteShortcut, type RemoteHomeStatus } from '../lib/remote-home';
import { actionLabel, remoteActions, remoteButtons, sameShortcut, type RemoteButton } from '../lib/remote-layout';

const props = defineProps<{ native: boolean; bindings: RemoteBinding[]; apps: AppEntry[]; saveBindings: (bindings: RemoteBinding[]) => Promise<boolean> }>();
const emit = defineEmits<{ capturing: [value: boolean] }>();
const selected = ref('home'), colors = ref(false);
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
    <header class="remote-heading"><div><span class="eyebrow">SKIP 1S · FLIRC</span><h3 id="remote-title">Vos boutons, vos actions</h3></div><span class="remote-count">{{ bindings.length }} associés</span></header>
    <div class="remote-workspace">
      <div class="remote-photo-column">
        <div class="remote-mode" aria-label="Mode de la couronne">
          <button :class="{active: !colors}" :aria-pressed="!colors" @click="colors = false">Navigation</button>
          <button :class="{active: colors}" :aria-pressed="colors" @click="colors = true">Couleurs</button>
        </div>
        <div class="remote-photo" aria-label="Télécommande Skip 1s">
          <img src="/devices/skip-1s.png" alt="Télécommande Skip 1s vue de face" width="1000" height="1000" draggable="false" />
          <button v-for="b in visibleButtons" :key="b.id" class="remote-hotspot" :class="{selected: selected === b.id, mapped: bindings.some(m => m.button === b.id), hardware: b.hardware, listening: listening && selected === b.id}" :style="position(b)" :aria-label="`Configurer ${b.label}`" :aria-pressed="selected === b.id" :title="b.label" :disabled="busy" @click="choose(b.id)"><span v-if="b.color" class="color-dot" :style="{background: {red:'#dd4242',green:'#42c76a',blue:'#269fd8',yellow:'#e4d83d'}[b.color]}" aria-hidden="true"></span></button>
        </div>
        <span class="remote-photo-caption">Cliquez sur un bouton de la photo.</span>
      </div>
      <div ref="inspector" class="remote-inspector">
        <label class="remote-field remote-button-picker"><span>Bouton</span><select :value="selected" :disabled="busy" @change="choose(($event.target as HTMLSelectElement).value)"><option v-for="b in remoteButtons" :key="b.id" :value="b.id">{{ b.label }}{{ bindings.some(m => m.button === b.id) ? ' · associé' : '' }}</option></select></label>
        <template v-if="button.hardware">
          <h4>{{ button.label }}</h4><p class="remote-explanation">{{ button.hardware }}</p>
          <button v-if="selected === 'colors'" class="small-button" @click="choose('red')">Associer les touches de couleur</button>
        </template>
        <template v-else>
          <div class="remote-signal" :class="{listening}"><div><span class="remote-label">{{ listening ? 'À l’écoute…' : 'Touche reçue' }}</span><kbd>{{ listening ? 'Appuyez sur la télécommande' : shortcutLabel(key) }}</kbd></div><span v-if="listening" class="listening-dot" aria-hidden="true"></span></div>
          <div class="remote-capture-actions"><button v-if="listening" class="small-button" @click="cancelCapture()">Annuler l’écoute</button><button v-else class="small-button" :disabled="busy || (native && !status?.available)" @click="beginCapture">{{ key ? 'Réapprendre la touche' : 'Apprendre la touche' }}</button><small v-if="listening">15 secondes · même Échap peut être associé</small></div>
          <label class="remote-field"><span>Action</span><select v-model="action" :disabled="busy || listening" @change="changeAction"><optgroup v-for="group in groups" :key="group" :label="group"><option v-for="a in remoteActions.filter(a => a.group === group)" :key="a.id" :value="a.id">{{ a.label }}</option></optgroup></select></label>
          <label v-if="action === 'launch'" class="remote-field"><span>Application</span><select v-model="appId" :disabled="busy || listening"><option :value="null">Choisir une application</option><option v-if="appId && !apps.some(a => a.id === appId)" :value="appId">Application retirée — choisissez-en une autre</option><option v-for="app in apps" :key="app.id" :value="app.id">{{ app.name }}</option></select><small v-if="!apps.length">Ajoutez d’abord des applications à votre bibliothèque.</small></label>
          <label v-if="globalAllowed" class="remote-scope"><input v-model="global" type="checkbox" role="switch" :disabled="busy || listening" /><span>Activer dans tout Windows<small>Canapey doit rester ouvert, même en arrière-plan.</small></span></label>
          <p v-if="global" class="remote-scope-note">Cette touche sera réservée sur tout Windows, y compris sur votre clavier. Elle peut remplacer son usage habituel dans les autres applications.</p><p v-else class="remote-scope-note">Mode local : cette association fonctionne uniquement dans Canapey. Activez le mode global pour l’utiliser ailleurs.</p>
          <p v-if="conflict" class="remote-error" role="alert">Touche déjà associée au bouton « {{ label(conflict.button) }} ».</p>
          <div class="remote-save-actions"><button class="primary" :disabled="busy || listening || !key || !!conflict" @click="save()">Enregistrer</button><button v-if="saved" class="small-button" :disabled="busy || listening" @click="save(true)">Retirer l’association</button></div>
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
.remote-config { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.remote-heading { display: flex; align-items: center; justify-content: space-between; gap: 14px; margin-bottom: 22px; flex-shrink: 0; }
.remote-heading h3 { margin: 7px 0 0; font-size: 21px; font-weight: 500; }.remote-count { color: #a4b7aa; white-space: nowrap; font-size: 11px; }
.remote-workspace { display: grid; grid-template-columns: 205px minmax(0, 1fr); gap: 34px; flex: 1; min-height: 0; }
.remote-photo-column { display: flex; flex-direction: column; align-items: center; min-height: 0; gap: 12px; }
.remote-mode { display: flex; background: #ffffff07; padding: 3px; border-radius: 7px; flex-shrink: 0; }
.remote-mode button { padding: 7px 9px; font-size: 10px; color: #9fa5ae; border-radius: 5px; }.remote-mode button.active { color: #eff4ee; background: #ffffff13; }
.remote-photo { position: relative; height: 100%; max-height: 620px; min-height: 330px; aspect-ratio: 240 / 920; overflow: hidden; border-radius: 18px; background: white; }
.remote-photo img { position: absolute; width: 416.6667%; max-width: none; height: auto; left: -158.3333%; top: -4.3478%; user-select: none; pointer-events: none; }
.remote-hotspot { position: absolute; transform: translate(-50%, -50%); border-radius: 50%; border: 2px solid transparent; background: transparent; padding: 0; transition: border-color 140ms, background 140ms, box-shadow 140ms; }
.remote-hotspot:hover { border-color: #d9efe5b3; background: #e3f5e326; }
.remote-hotspot.selected, .remote-hotspot:focus-visible { border-color: #c4f5d5; box-shadow: 0 0 0 2px #36654c; background: #c4f5d51c; outline: none; }
.remote-hotspot.mapped::after { content: ''; position: absolute; right: -2px; top: -2px; width: 5px; height: 5px; border-radius: 50%; background: #b6efc7; box-shadow: 0 0 0 1px #213528; }
.remote-hotspot.hardware:hover { border-style: dashed; }.remote-hotspot.listening { animation: remote-pulse 1.2s ease-in-out infinite; }
.color-dot { display: block; width: 8px; height: 8px; border-radius: 50%; margin: auto; }
.remote-photo-caption { font-size: 10px; color: #7e8895; flex-shrink: 0; }
.remote-inspector { min-width: 0; overflow-y: auto; padding-right: 8px; padding-bottom: 20px; scrollbar-gutter: stable; }
.remote-field { display: flex; flex-direction: column; gap: 9px; margin-bottom: 22px; }.remote-field > span, .remote-label { color: #929ba8; font-size: 11px; }.remote-field select { width: 100%; min-width: 0; max-width: 100%; font-size: 13px; }.remote-field small { font-size: 11px; color: #9da6b1; line-height: 1.7; }
.remote-button-picker select { font-size: 18px; color: #f0f0ee; }
.remote-signal { display: flex; align-items: center; justify-content: space-between; min-height: 80px; padding: 16px 0; border-top: 1px solid #ffffff15; border-bottom: 1px solid #ffffff15; }.remote-signal kbd { display: block; border: 0; padding: 0; margin-top: 9px; font-size: 15px; height: auto; line-height: 1.5; color: #e2e8e3; background: none; white-space: normal; }
.remote-capture-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; margin: 13px 0 28px; }.remote-capture-actions small { font-size: 10px; color: #9da6b1; }
.remote-scope { display: flex; gap: 13px; align-items: center; margin-bottom: 24px; font-size: 12px; line-height: 1.5; }.remote-scope small { display: block; font-size: 11px; color: #818b97; margin-top: 5px; }.remote-scope input { flex-shrink: 0; }.remote-scope-note { font-size: 12px; color: #9da6b1; margin-bottom: 22px; }
.remote-save-actions { display: flex; flex-wrap: wrap; gap: 10px; }.remote-save-actions button { white-space: normal; }.remote-saved { font-size: 11px; color: #a7bdad; line-height: 1.8; }
.remote-error { color: #f0b5a5; font-size: 12px; line-height: 1.7; white-space: pre-line; }.remote-message { font-size: 12px; line-height: 1.7; color: #bacfbd; }
.remote-help { margin-top: 30px; border-top: 1px solid #ffffff15; padding-top: 18px; font-size: 12px; line-height: 1.8; color: #9fa8b5; }.remote-help summary { cursor: pointer; color: #c5cbd2; }.remote-help p { margin: 12px 0 0; }.remote-preview { font-size: 10px; line-height: 1.7; color: #7e8997; margin: 15px 0 0; }.remote-explanation { font-size: 13px; color: #aeb5bf; line-height: 1.8; }
.listening-dot { width: 7px; height: 7px; border-radius: 50%; background: #b6efc7; animation: remote-pulse 1.2s ease-in-out infinite; }
@keyframes remote-pulse { 50% { box-shadow: 0 0 0 5px #b6efc72b; } }
@media (prefers-reduced-motion: reduce) { .remote-hotspot, .listening-dot { animation: none !important; transition: none; } }
@media (max-width: 1050px) { .remote-workspace { grid-template-columns: 150px minmax(0, 1fr); gap: 22px; } }
@media (max-width: 700px) {
  .remote-config { height: auto; }.remote-workspace { grid-template-columns: 1fr; gap: 26px; }.remote-heading h3 { font-size: 18px; }.remote-heading { margin-bottom: 20px; }.remote-count { font-size: 10px; }
  .remote-photo { height: 580px; width: auto; min-height: 0; }.remote-photo-column { min-height: auto; }.remote-inspector { overflow: visible; padding-right: 0; scroll-margin-top: 12px; }.remote-button-picker select { font-size: 16px; }
}
</style>
