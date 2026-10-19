<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { appleRemoteStatus, pairAppleRemote, cancelApplePairing, forgetAppleRemote, onAppleRemoteStatus, emptyAppleRemoteStatus, defaultAppleRemote, type AppleRemoteSettings } from '../lib/apple-remote';
const props = defineProps<{ native: boolean; settings?: AppleRemoteSettings; saveSettings: (settings: AppleRemoteSettings) => Promise<boolean> }>();
const draft = ref({ ...(props.settings ?? defaultAppleRemote()) });
const status = ref(emptyAppleRemoteStatus());
const busy = ref(false), error = ref('');
let alive = true, timer: ReturnType<typeof setInterval> | undefined, stop: (() => void) | undefined;
watch(() => props.settings, value => { draft.value = { ...(value ?? defaultAppleRemote()) }; }, { deep: true });
const enabled = computed(() => props.settings?.enabled ?? false);
const supported = computed(() => props.native && status.value.available);
const label = computed(() => !supported.value ? 'Disponible sous Windows' : !enabled.value ? 'Désactivée' : status.value.error ? 'À vérifier' : status.value.running ? 'Prête à se connecter' : 'Démarrage…');
async function refresh() { if (props.native && alive) { try { const result = await appleRemoteStatus(); if (alive) status.value = result; } catch (e) { if (alive) error.value = String(e); } } }
async function run(action: () => Promise<unknown>) { if (busy.value) return; busy.value = true; error.value = ''; try { await action(); await refresh(); } catch (e) { error.value = String(e); } finally { busy.value = false; } }
async function save() {
  await run(async () => {
    const value = { ...draft.value, name: draft.value.name.trim() };
    if (!value.name || new TextEncoder().encode(value.name).length > 63) throw new Error('Choisissez un nom de 1 à 63 octets.');
    if (!(await props.saveSettings(value))) { draft.value = { ...(props.settings ?? defaultAppleRemote()) }; throw new Error('Les réglages n’ont pas été enregistrés.'); }
  });
}
async function toggle(event: Event) { draft.value.enabled = (event.target as HTMLInputElement).checked; await save(); }
onMounted(async () => {
  if (!props.native) return;
  try { const unsubscribe = await onAppleRemoteStatus(value => { if (alive) status.value = value; }); if (!alive) unsubscribe(); else stop = unsubscribe; } catch (e) { error.value = String(e); }
  if (alive) { await refresh(); timer = setInterval(() => void refresh(), 1000); }
});
onUnmounted(() => { alive = false; clearInterval(timer); stop?.(); if (props.native && status.value.pairing.pin) void cancelApplePairing().catch(() => {}); });
</script>

<template>
  <section class="apple-remote" aria-labelledby="apple-remote-title">
    <header class="apple-heading">
      <div><span class="apple-eyebrow">IPHONE · EXPÉRIMENTAL</span><h3 id="apple-remote-title">Votre iPhone, votre télécommande.</h3><p>Utilisez Télécommande Apple TV depuis le Centre de contrôle. Aucune application à installer.</p></div>
      <span class="apple-state" :class="{ ready: status.running }" role="status">{{ label }}</span>
    </header>
    <label class="setting-row apple-enable"><span>Activer la télécommande iPhone<small>Sur le même réseau local privé que votre PC.</small></span><input type="checkbox" role="switch" :checked="enabled" :disabled="!supported || busy" @change="toggle" /></label>
    <p v-if="!supported" class="apple-note">La connexion à l’iPhone est disponible dans Canapey sous Windows. Cet aperçu ne démarre aucun service réseau.</p>
    <template v-if="supported && enabled">
      <div class="apple-pair-card">
        <template v-if="status.pairing.pin">
          <div><h4>Saisissez ce code sur l’iPhone</h4><p>Centre de contrôle → Télécommande Apple TV → {{ settings?.name }}</p></div>
          <div class="apple-pin" aria-label="Code d’association">{{ status.pairing.pin }}</div>
          <div class="apple-pair-footer"><span>Expire dans {{ status.pairing.secondsRemaining }} s</span><button class="small-button" :disabled="busy" @click="run(cancelApplePairing)">Annuler l’association</button></div>
        </template>
        <template v-else>
          <div><h4>Associer votre iPhone</h4><p>Ouvrez Télécommande Apple TV sur l’iPhone, puis choisissez le nom de ce PC. Le code apparaîtra ici.</p></div>
          <button class="primary-button" :disabled="busy || !status.running" @click="run(pairAppleRemote)">Associer un iPhone</button>
          <small>L’association reste ouverte pendant deux minutes.</small>
        </template>
      </div>
      <details class="apple-connection-settings"><summary>Nom et réseau</summary>
      <div class="apple-fields">
        <label>Nom affiché sur l’iPhone<input v-model="draft.name" type="text" maxlength="63" autocomplete="off" :disabled="busy" /></label>
        <label>Réseau privé<select v-model="draft.interface" :disabled="busy"><option :value="null">Automatique</option><option v-for="network in status.networks" :key="network.id" :value="network.id">{{ network.label }} · {{ network.address }}</option><option v-if="draft.interface && !status.networks.some(n => n.id === draft.interface)" :value="draft.interface">Réseau enregistré indisponible</option></select></label>
        <button class="small-button" :disabled="busy" @click="save">Enregistrer les réglages</button>
      </div>
      </details>
      <div v-if="status.pairing.devices.length" class="apple-devices"><h4>Appareils associés</h4><div v-for="(device, index) in status.pairing.devices" :key="device.id" class="apple-device"><div><strong>Appareil {{ index + 1 }}</strong><span>{{ device.connected ? 'Connecté' : 'Mémorisé' }}</span><code :title="device.id">{{ device.id }}</code></div><button class="small-button" :disabled="busy" :aria-label="`Dissocier l’appareil ${index + 1}`" @click="run(() => forgetAppleRemote(device.id))">Dissocier</button></div></div>
    </template>
    <p v-if="error || status.error" class="apple-error" role="alert">{{ error || status.error }}</p>
    <div class="apple-controls"><h4>Les gestes à connaître</h4><dl><div><dt>Glisser</dt><dd>Naviguer</dd></div><div><dt>Toucher</dt><dd>Valider</dd></div><div><dt>Retour</dt><dd>Revenir en arrière</dd></div><div><dt>Bouton TV</dt><dd>Revenir à Canapey</dd></div><div><dt>Lecture et volume</dt><dd>Contrôler le PC</dd></div></dl><p>Dans les autres applications, les gestes envoient les flèches, Entrée et Échap. Leur prise en charge dépend de l’application.</p></div>
    <details v-if="supported && enabled" class="apple-diagnostic"><summary>Mon iPhone ne trouve pas Canapey</summary><p>Connectez les deux appareils au même réseau local. Dans Windows, ce réseau doit avoir le profil Privé. Les réseaux invités et certains VPN bloquent la découverte.</p><p>Dans le pare-feu Windows, autorisez Canapey uniquement sur les réseaux privés : connexion TCP et découverte mDNS (UDP 5353).</p><p v-if="status.address">Adresse d’écoute : <code>{{ status.address }}</code></p><p>La navigation ne contrôle pas les fenêtres administrateur ni les interfaces qui ignorent les touches Windows. Canapey doit rester ouvert ; le réveil du PC n’est pas pris en charge.</p></details>
  </section>
</template>
<style scoped>
.apple-remote{display:grid;gap:16px;max-width:960px}.apple-heading{display:flex;align-items:flex-start;gap:24px;justify-content:space-between}.apple-heading h3{margin:8px 0 10px;font-size:25px;letter-spacing:-.5px}.apple-heading p,.apple-note,.apple-controls p,.apple-diagnostic p{color:var(--muted,#a8abb4);font-size:14px;line-height:1.65;margin:0;max-width:620px}.apple-eyebrow{font-size:10px;font-weight:700;letter-spacing:2px;color:#c7c7bb}.apple-state{flex-shrink:0;max-width:180px;border:1px solid #ffffff20;padding:8px 12px;border-radius:30px;font-size:12px;color:#bbb}.apple-state.ready{color:#a9ddb7;border-color:#a9ddb740;background:#a9ddb70b}.apple-enable{border-block:1px solid #ffffff13;padding-block:14px}.apple-connection-settings summary{cursor:pointer;font-size:13px;padding:6px 0}.apple-connection-settings[open] summary{margin-bottom:12px}.apple-fields{display:grid;grid-template-columns:1fr 1fr;gap:16px}.apple-fields label{display:grid;gap:8px;font-size:13px}.apple-fields input,.apple-fields select{width:100%;min-width:0}.apple-fields button{justify-self:start;grid-column:1/-1}.apple-pair-card{border:1px solid #ffffff20;border-radius:16px;padding:20px;display:grid;gap:16px;background:linear-gradient(125deg,#ffffff08,transparent)}h4{margin:0 0 6px;font-size:16px}.apple-pair-card p{margin:0;color:#b7b9c2;line-height:1.6;font-size:14px}.apple-pair-card button{justify-self:start}.apple-pair-card small,.apple-pair-footer{font-size:12px;color:#a8abb4}.apple-pin{font-variant-numeric:tabular-nums;font-size:54px;letter-spacing:16px;font-weight:600;color:#f1efdc;line-height:1.3}.apple-pair-footer{display:flex;align-items:center;justify-content:space-between;gap:12px}.apple-controls dl{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin:16px 0}.apple-controls dt{color:#ddd;font-size:13px}.apple-controls dd{margin:4px 0 0;color:#999;font-size:12px}.apple-devices{display:grid;gap:12px}.apple-device{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 0;border-bottom:1px solid #ffffff13}.apple-device>div{min-width:0;display:grid;gap:4px}.apple-device strong{font-size:14px}.apple-device span{font-size:12px;color:#a8abb4}.apple-device code{font-size:10px;color:#888;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.apple-error{color:#f1b5a9;background:#c55c4414;border:1px solid #c55c4430;border-radius:10px;padding:12px 16px;font-size:14px;line-height:1.6;margin:0}.apple-diagnostic{font-size:13px}.apple-diagnostic summary{cursor:pointer;padding:8px 0}.apple-diagnostic p{margin-top:10px}.apple-remote button:disabled{opacity:.45;cursor:not-allowed}@media(max-width:650px){.apple-heading{flex-direction:column;gap:12px}.apple-heading h3{font-size:22px}.apple-fields{grid-template-columns:1fr}.apple-pair-card{padding:18px}.apple-controls dl{grid-template-columns:1fr 1fr}.apple-pair-footer{align-items:flex-start;flex-direction:column}.apple-pin{font-size:44px;letter-spacing:12px}.apple-device{gap:8px}}
</style>
