<script setup lang="ts">
import { t } from '../lib/i18n';
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
const label = computed(() => !supported.value ? t('Available on Windows') : !enabled.value ? t('Disabled') : status.value.error ? t('Needs attention') : status.value.running ? t('Ready to connect') : t('Starting…'));
async function refresh() { if (props.native && alive) { try { const result = await appleRemoteStatus(); if (alive) status.value = result; } catch (e) { if (alive) error.value = String(e); } } }
async function run(action: () => Promise<unknown>) { if (busy.value) return; busy.value = true; error.value = ''; try { await action(); await refresh(); } catch (e) { error.value = String(e); } finally { busy.value = false; } }
async function save() {
  await run(async () => {
    const value = { ...draft.value, name: draft.value.name.trim() };
    if (!value.name || new TextEncoder().encode(value.name).length > 63) throw new Error(t('Choose a name between 1 and 63 bytes.'));
    if (!(await props.saveSettings(value))) { draft.value = { ...(props.settings ?? defaultAppleRemote()) }; throw new Error(t('The settings were not saved.')); }
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
      <div><span class="apple-eyebrow">{{ t('IPHONE · EXPERIMENTAL') }}</span><h3 id="apple-remote-title">{{ t('Your iPhone, your remote.') }}</h3><p>{{ t('Use Apple TV Remote from Control Center. No app to install.') }}</p></div>
      <span class="apple-state" :class="{ ready: status.running }" role="status">{{ label }}</span>
    </header>
    <label class="setting-row apple-enable"><span>{{ t('Enable iPhone remote') }}<small>{{ t('On the same private local network as your PC.') }}</small></span><input type="checkbox" role="switch" :checked="enabled" :disabled="!supported || busy" @change="toggle" /></label>
    <p v-if="!supported" class="apple-note">{{ t('iPhone connectivity is available in Canapey on Windows. This preview does not start a network service.') }}</p>
    <template v-if="supported && enabled">
      <div class="apple-pair-card">
        <template v-if="status.pairing.pin">
          <div><h4>{{ t('Enter this code on your iPhone') }}</h4><p>{{ t('Control Center → Apple TV Remote →') }} {{ settings?.name }}</p></div>
          <div class="apple-pin" :aria-label="t('Pairing code')">{{ status.pairing.pin }}</div>
          <div class="apple-pair-footer"><span>{{ t('Expires in') }} {{ status.pairing.secondsRemaining }} s</span><button class="small-button" :disabled="busy" @click="run(cancelApplePairing)">{{ t('Cancel pairing') }}</button></div>
        </template>
        <template v-else>
          <div><h4>{{ t('Pair your iPhone') }}</h4><p>{{ t('Open Apple TV Remote on your iPhone, then choose this PC’s name. The code will appear here.') }}</p></div>
          <button class="primary-button" :disabled="busy || !status.running" @click="run(pairAppleRemote)">{{ t('Pair an iPhone') }}</button>
          <small>{{ t('Pairing stays open for two minutes.') }}</small>
        </template>
      </div>
      <details class="apple-connection-settings"><summary>{{ t('Name and network') }}</summary>
      <div class="apple-fields">
        <label>{{ t('Name shown on iPhone') }}<input v-model="draft.name" type="text" maxlength="63" autocomplete="off" :disabled="busy" /></label>
        <label>{{ t('Private network') }}<select v-model="draft.interface" :disabled="busy"><option :value="null">{{ t('Automatic') }}</option><option v-for="network in status.networks" :key="network.id" :value="network.id">{{ network.label }} · {{ network.address }}</option><option v-if="draft.interface && !status.networks.some(n => n.id === draft.interface)" :value="draft.interface">{{ t('Saved network unavailable') }}</option></select></label>
        <button class="small-button" :disabled="busy" @click="save">{{ t('Save settings') }}</button>
      </div>
      </details>
      <div v-if="status.pairing.devices.length" class="apple-devices"><h4>{{ t('Paired devices') }}</h4><div v-for="(device, index) in status.pairing.devices" :key="device.id" class="apple-device"><div><strong>{{ t('Device') }} {{ index + 1 }}</strong><span>{{ device.connected ? t('Connected') : t('Remembered') }}</span><code :title="device.id">{{ device.id }}</code></div><button class="small-button" :disabled="busy" :aria-label="t('Unpair device {0}', [index + 1])" @click="run(() => forgetAppleRemote(device.id))">{{ t('Unpair') }}</button></div></div>
    </template>
    <p v-if="error || status.error" class="apple-error" role="alert">{{ error || status.error }}</p>
    <div class="apple-controls"><h4>{{ t('Gestures at a glance') }}</h4><dl><div><dt>{{ t('Swipe') }}</dt><dd>{{ t('Navigate') }}</dd></div><div><dt>{{ t('Tap') }}</dt><dd>{{ t('Confirm') }}</dd></div><div><dt>{{ t('Back') }}</dt><dd>{{ t('Go back') }}</dd></div><div><dt>{{ t('TV button') }}</dt><dd>{{ t('Return to Canapey') }}</dd></div><div><dt>{{ t('Playback and volume') }}</dt><dd>{{ t('Control the PC') }}</dd></div></dl><p>{{ t('In other apps, gestures send arrow keys, Enter and Escape. Support depends on the app.') }}</p></div>
    <details v-if="supported && enabled" class="apple-diagnostic"><summary>{{ t('My iPhone cannot find Canapey') }}</summary><p>{{ t('Connect both devices to the same local network. In Windows, set the network profile to Private. Guest networks and some VPNs block discovery.') }}</p><p>{{ t('In Windows Firewall, allow Canapey on private networks only: TCP on the displayed port and mDNS discovery (UDP 5353).') }}</p><p v-if="status.address">{{ t('Listening address:') }} <code>{{ status.address }}</code></p><p>{{ t('Navigation cannot control administrator windows or interfaces that ignore Windows key messages. Canapey must stay open; waking the PC is not supported.') }}</p></details>
  </section>
</template>
<style scoped>
.apple-remote{display:grid;gap:16px;max-width:960px}.apple-heading{display:flex;align-items:flex-start;gap:24px;justify-content:space-between}.apple-heading h3{margin:8px 0 10px;font-size:25px;letter-spacing:-.5px}.apple-heading p,.apple-note,.apple-controls p,.apple-diagnostic p{color:var(--muted,#a8abb4);font-size:14px;line-height:1.65;margin:0;max-width:620px}.apple-eyebrow{font-size:10px;font-weight:700;letter-spacing:2px;color:#c7c7bb}.apple-state{flex-shrink:0;max-width:180px;border:1px solid #ffffff20;padding:8px 12px;border-radius:30px;font-size:12px;color:#bbb}.apple-state.ready{color:#a9ddb7;border-color:#a9ddb740;background:#a9ddb70b}.apple-enable{border-block:1px solid #ffffff13;padding-block:14px}.apple-connection-settings summary{cursor:pointer;font-size:13px;padding:6px 0}.apple-connection-settings[open] summary{margin-bottom:12px}.apple-fields{display:grid;grid-template-columns:1fr 1fr;gap:16px}.apple-fields label{display:grid;gap:8px;font-size:13px}.apple-fields input,.apple-fields select{width:100%;min-width:0}.apple-fields button{justify-self:start;grid-column:1/-1}.apple-pair-card{border:1px solid #ffffff20;border-radius:16px;padding:20px;display:grid;gap:16px;background:linear-gradient(125deg,#ffffff08,transparent)}h4{margin:0 0 6px;font-size:16px}.apple-pair-card p{margin:0;color:#b7b9c2;line-height:1.6;font-size:14px}.apple-pair-card button{justify-self:start}.apple-pair-card small,.apple-pair-footer{font-size:12px;color:#a8abb4}.apple-pin{font-variant-numeric:tabular-nums;font-size:54px;letter-spacing:16px;font-weight:600;color:#f1efdc;line-height:1.3}.apple-pair-footer{display:flex;align-items:center;justify-content:space-between;gap:12px}.apple-controls dl{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin:16px 0}.apple-controls dt{color:#ddd;font-size:13px}.apple-controls dd{margin:4px 0 0;color:#999;font-size:12px}.apple-devices{display:grid;gap:12px}.apple-device{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 0;border-bottom:1px solid #ffffff13}.apple-device>div{min-width:0;display:grid;gap:4px}.apple-device strong{font-size:14px}.apple-device span{font-size:12px;color:#a8abb4}.apple-device code{font-size:10px;color:#888;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.apple-error{color:#f1b5a9;background:#c55c4414;border:1px solid #c55c4430;border-radius:10px;padding:12px 16px;font-size:14px;line-height:1.6;margin:0}.apple-diagnostic{font-size:13px}.apple-diagnostic summary{cursor:pointer;padding:8px 0}.apple-diagnostic p{margin-top:10px}.apple-remote button:disabled{opacity:.45;cursor:not-allowed}@media(max-width:650px){.apple-heading{flex-direction:column;gap:12px}.apple-heading h3{font-size:22px}.apple-fields{grid-template-columns:1fr}.apple-pair-card{padding:18px}.apple-controls dl{grid-template-columns:1fr 1fr}.apple-pair-footer{align-items:flex-start;flex-direction:column}.apple-pin{font-size:44px;letter-spacing:12px}.apple-device{gap:8px}}
</style>
