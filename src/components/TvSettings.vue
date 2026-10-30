<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import { t } from '../lib/i18n';
import Icon from './Icon.vue';
import { cancelTvPairing, discoverTvs, emptyTvStatus, finishTvPairing, forgetTv, inspectTv, pairTv, pairingSeconds, saveTvPreferences, tvStatus, validTvMac, validTvPin, wakeTv, standbyTv, type Television } from '../lib/tv';
const props = defineProps<{ native: boolean; autostart: boolean }>();
const emit = defineEmits<{ startup: [] }>();
const status = ref(emptyTvStatus()), busy = ref(''), error = ref('');
const results = ref<Television[]>([]), searched = ref(false), selected = ref<Television | null>(null);
const changing = ref(false), removing = ref(false), manualIp = ref(''), manualMac = ref('');
const pin = ref(''), deadline = ref(0), seconds = ref(0), pinInput = ref<HTMLInputElement>();
const resultsHeading = ref<HTMLElement>(), connectedHeading = ref<HTMLElement>();
const supported = computed(() => props.native && status.value.available);
const working = computed(() => !!busy.value || status.value.waking);
const setup = computed(() => !status.value.tv || changing.value);
const stage = computed(() => deadline.value ? 2 : selected.value ? 1 : 0);
let alive = true, timer: ReturnType<typeof setInterval> | undefined, refreshing = false;
async function refresh() {
  if (!props.native || !alive || refreshing) return;
  refreshing = true;
  try { const value = await tvStatus(); if (alive) status.value = value; }
  catch (e) { if (alive) error.value = String(e); }
  finally { refreshing = false; }
}
async function run(name: string, action: () => Promise<void>) {
  if (working.value) return;
  busy.value = name; error.value = '';
  try { await action(); } catch (e) { if (alive) error.value = String(e); }
  finally { if (alive) busy.value = ''; }
}
async function search() {
  await run('search', async () => {
    const found = await discoverTvs(); if (!alive) return;
    results.value = found; searched.value = true; selected.value = null;
    await nextTick(); resultsHeading.value?.focus();
  });
}
async function manual() {
  await run('inspect', async () => { const tv = await inspectTv(manualIp.value.trim()); if (alive) choose(tv); });
}
function choose(tv: Television) { selected.value = tv; manualMac.value = tv.mac ?? ''; error.value = ''; }
async function beginPairing() {
  if (!selected.value) return;
  await run('pair', async () => {
    const result = await pairTv({ ...selected.value!, mac: manualMac.value.trim().replaceAll('-', ':').toUpperCase() });
    if (!alive) { await cancelTvPairing(); return; }
    deadline.value = Date.now() + result.secondsRemaining * 1000; seconds.value = pairingSeconds(deadline.value); pin.value = '';
    await nextTick(); pinInput.value?.focus();
  });
}
async function finish() {
  if (!validTvPin(pin.value) || seconds.value === 0) return;
  await run('finish', async () => {
    const value = await finishTvPairing(pin.value); if (!alive) return;
    status.value = value; deadline.value = 0; pin.value = ''; selected.value = null; changing.value = false;
    await nextTick(); connectedHeading.value?.focus();
  });
}
async function cancel() {
  await run('cancel', async () => {
    await cancelTvPairing(); deadline.value = 0; pin.value = ''; error.value = '';
  });
}
async function preference(key: 'autoWake' | 'autoStandby', event: Event) {
  const input = event.target as HTMLInputElement;
  const checked = input.checked;
  // Keep the switch at the persisted value until the native save succeeds.
  input.checked = status.value[key];
  await run('save', async () => {
    const value = await saveTvPreferences(key === 'autoWake' ? checked : status.value.autoWake, key === 'autoStandby' ? checked : status.value.autoStandby);
    if (alive) status.value = value;
  });
}
async function testStandby() { await run('standby', async () => { const value = await standbyTv(); if (alive) status.value = value; }); }
async function testWake() { await run('wake', async () => { const value = await wakeTv(); if (alive) status.value = value; }); }
async function remove() { await run('forget', async () => { const value = await forgetTv(); if (alive) { status.value = value; removing.value = false; searched.value = false; results.value = []; } }); }
onMounted(async () => {
  await refresh();
  if (alive) timer = setInterval(() => { seconds.value = pairingSeconds(deadline.value); if (!busy.value) void refresh(); }, 1000);
});
onUnmounted(() => {
  alive = false; clearInterval(timer);
  if (props.native) void cancelTvPairing().catch(() => {});
});
</script>

<template>
  <section class="tv-settings" aria-labelledby="tv-title">
    <header class="tv-heading"><Icon name="monitor" :size="30" /><div><h3 id="tv-title">{{ t('Your TV and PC, together') }}</h3><p>{{ t('Find your Philips TV, enter its code, and choose when it turns on or off.') }}</p></div></header>
    <p v-if="!supported" class="tv-note">{{ t('TV pairing and automatic wake are available in Canapey on Windows. Network discovery is disabled in this preview.') }}</p>
    <template v-if="setup">
      <ol class="tv-steps" :aria-label="t('TV setup progress')"><li v-for="(label, i) in [t('Find your TV'), t('Connect'), t('Enter code')]" :key="label" :aria-current="stage === i ? 'step' : undefined"><span>{{ i + 1 }}</span>{{ label }}</li></ol>
      <div v-if="!deadline" class="tv-setup">
        <template v-if="!selected">
          <p>{{ t('Turn your TV on and connect it to the same home network as this PC.') }}</p>
          <button class="primary-button" :disabled="!supported || working" @click="search"><Icon name="search" :size="20" />{{ busy === 'search' ? t('Searching for TVs…') : searched ? t('Search again') : t('Find my TV') }}</button>
          <div v-if="searched" class="tv-results"><h4 ref="resultsHeading" tabindex="-1">{{ results.length ? t('Choose your TV') : t('No compatible TV found yet') }}</h4>
            <p v-if="!results.length">{{ t('Keep the TV on. Guest Wi-Fi, VPNs and firewalls can prevent discovery. You can also enter its IP address below.') }}</p>
            <button v-for="tv in results" :key="tv.ip" class="tv-result" :disabled="working" @click="choose(tv)"><Icon name="monitor" :size="24" /><span><strong>{{ tv.name }}</strong><small>{{ t('Philips') }} · {{ tv.ip }}</small></span><Icon name="right" :size="18" /></button>
          </div>
          <details class="tv-manual"><summary>{{ t('My TV is not listed') }}</summary><p>{{ t('Only Philips TVs with PIN pairing are supported for now. Find the IP address in the TV’s network settings.') }}</p><form @submit.prevent="manual"><label for="tv-ip">{{ t('TV IP address') }}</label><div class="tv-form-row"><input id="tv-ip" v-model="manualIp" placeholder="192.168.1.20" autocomplete="off" inputmode="decimal" maxlength="15" :disabled="!supported || working" /><button class="small-button" :disabled="!supported || working || !manualIp.trim()">{{ busy === 'inspect' ? t('Checking TV…') : t('Find this TV') }}</button></div></form></details>
        </template>
        <template v-else>
          <div class="tv-selected"><Icon name="monitor" :size="28" /><div><h4>{{ selected.name }}</h4><span>{{ selected.ip }}</span></div></div>
          <p>{{ t('A four-digit code will appear on your TV. Enter it here to connect.') }}</p>
          <div v-if="!selected.mac" class="tv-mac"><label for="tv-mac">{{ t('TV network MAC address') }}</label><p>{{ t('We could not read it automatically. Copy the MAC address of the active Wi-Fi or Ethernet connection from the TV’s network settings.') }}</p><input id="tv-mac" v-model="manualMac" placeholder="AA:BB:CC:DD:EE:FF" maxlength="17" autocomplete="off" :disabled="working" /></div>
          <p class="tv-note">{{ t('Automatic wake is enabled after pairing. Automatic standby stays off until you enable it.') }}</p>
          <div class="tv-actions"><button class="primary-button" :disabled="working || !validTvMac(manualMac)" @click="beginPairing">{{ busy === 'pair' ? t('Requesting code…') : t('Show code on TV') }}</button><button class="small-button" :disabled="working" @click="selected = null">{{ t('Back') }}</button></div>
        </template>
      </div>
      <form v-else class="tv-code" @submit.prevent="finish">
        <h4>{{ t('Enter the code on {0}', [selected?.name]) }}</h4>
        <label for="tv-pin">{{ t('TV pairing code') }}</label>
        <input id="tv-pin" ref="pinInput" v-model="pin" class="tv-pin" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{4}" maxlength="4" :disabled="working || seconds === 0" aria-describedby="tv-expiry" />
        <p id="tv-expiry" role="status">{{ seconds > 0 ? t('Code expires in {0} seconds.', [seconds]) : t('The code expired. Request a new one on your TV.') }}</p>
        <div class="tv-actions"><button v-if="seconds > 0" class="primary-button" :disabled="working || !validTvPin(pin)" type="submit">{{ busy === 'finish' ? t('Connecting…') : t('Connect TV') }}</button><button v-else class="primary-button" type="button" :disabled="working" @click="beginPairing">{{ t('Request a new code') }}</button><button class="small-button" type="button" :disabled="working" @click="cancel">{{ t('Cancel pairing') }}</button></div>
      </form>
      <button v-if="changing && !deadline" class="small-button" :disabled="working" @click="changing = false; selected = null; error = ''">{{ t('Keep current TV') }}</button>
    </template>
    <template v-else-if="status.tv">
      <div class="tv-connected"><Icon name="monitor" :size="28" /><div><h4 ref="connectedHeading" tabindex="-1">{{ status.tv.name }}</h4><span>{{ t('Paired') }}</span></div><button class="small-button" :disabled="working" @click="changing = true; selected = null; results = []; searched = false">{{ t('Change TV') }}</button></div>
      <div class="tv-options">
        <label class="setting-row"><span>{{ t('Turn on the TV automatically') }}<small>{{ t('Wake on LAN and screen power when Canapey starts or the PC wakes.') }}</small></span><input type="checkbox" role="switch" :checked="status.autoWake" :disabled="working" @change="preference('autoWake', $event)" /></label>
        <label class="setting-row"><span>{{ t('Turn off the TV automatically') }}<small>{{ t('Put the TV in standby when the PC sleeps, shuts down or restarts. Canapey must stay open.') }}</small></span><input type="checkbox" role="switch" :checked="status.autoStandby" :disabled="working" @change="preference('autoStandby', $event)" /></label>
      </div>
      <p v-if="(status.autoWake || status.autoStandby) && !status.resumeAvailable" class="tv-note">{{ t('Windows sleep notifications are not available. Restart Canapey to enable automatic TV power.') }}</p>
      <div v-if="status.autoWake && !autostart" class="tv-startup"><p>{{ t('To wake the TV when Windows starts, also enable Canapey’s launch at startup.') }}</p><button class="small-button" @click="emit('startup')">{{ t('Open startup settings') }}</button></div>
      <div class="tv-test"><div class="tv-actions"><button class="primary-button" :disabled="working" @click="testWake"><Icon name="power" :size="20" />{{ working && (busy === 'wake' || status.waking) ? t('Waking the TV…') : t('Test TV wake') }}</button><button class="small-button" :disabled="working" @click="testStandby">{{ busy === 'standby' ? t('Turning off the TV…') : t('Turn off TV now') }}</button></div><small>{{ t('Put the TV in standby first to test wake. Allow up to 70 seconds.') }}</small></div>
      <details class="tv-manual"><summary>{{ t('Connection details and troubleshooting') }}</summary><dl><dt>{{ t('IP address') }}</dt><dd>{{ status.tv.ip }}</dd><dt>{{ t('MAC address') }}</dt><dd>{{ status.tv.mac }}</dd></dl><p>{{ t('Enable network wake in the TV’s settings. Philips may call it Switch on with Wi-Fi (WoWLAN) or Wake on LAN. The TV must remain connected to power and the same local network.') }}</p><p>{{ t('If your router changes the TV’s IP address, Canapey tries to find it again. If that fails, turn the TV on and use Change TV to reconnect.') }}</p><p>{{ t('Forgetting removes the pairing from this PC. You can also revoke Canapey in the TV’s paired apps settings.') }}</p><button v-if="!removing" class="small-button" :disabled="working" @click="removing = true">{{ t('Forget this TV') }}</button><div v-else class="tv-actions"><span>{{ t('Remove this pairing and disable automatic TV power?') }}</span><button class="small-button" :disabled="working" @click="remove">{{ t('Forget TV') }}</button><button class="small-button" @click="removing = false">{{ t('Cancel') }}</button></div></details>
    </template>
    <p v-if="error || status.error" class="tv-error" role="alert">{{ t(error || status.error || '') }}</p>
    <p v-else-if="status.message && !setup" class="tv-message" role="status">{{ t(status.message) }}</p>
  </section>
</template>

<style scoped>
.tv-settings{max-width:880px;display:grid;gap:20px}.tv-heading{display:flex;gap:18px;align-items:flex-start}.tv-heading>svg{margin-top:8px;color:var(--cream)}.tv-heading h3{font-size:26px;margin:0 0 10px;letter-spacing:-.6px}.tv-settings p{margin:0;font-size:15px;line-height:1.65;color:#b6b8c0;max-width:660px}.tv-settings h4{font-size:19px;margin:0 0 8px}.tv-settings button{min-height:46px}.tv-settings button:disabled{opacity:.45;cursor:not-allowed}.tv-settings input{max-width:100%;min-width:0}.tv-steps{display:flex;gap:26px;list-style:none;padding:20px 0;margin:0;border-block:1px solid #ffffff18}.tv-steps li{display:flex;gap:10px;align-items:center;font-size:13px;color:#8c8e96}.tv-steps li[aria-current]{color:var(--cream)}.tv-steps li>span{display:grid;place-items:center;border:1px solid #ffffff25;border-radius:50%;width:28px;height:28px;font-variant-numeric:tabular-nums}.tv-steps li[aria-current]>span{background:var(--cream);color:#17191e;border-color:transparent}.tv-setup,.tv-code,.tv-results,.tv-mac{display:grid;gap:18px}.tv-setup>.primary-button,.tv-test>.primary-button{justify-self:start}.tv-results h4:focus,.tv-connected h4:focus{outline:2px solid var(--cream);outline-offset:5px}.tv-result{display:flex;align-items:center;gap:16px;text-align:left;border-block-end:1px solid #ffffff18;padding:18px 4px;width:100%;border-radius:0}.tv-result>span{display:grid;gap:6px;flex:1;min-width:0}.tv-result strong{font-size:18px;overflow-wrap:anywhere}.tv-result small,.tv-selected span,.tv-connected span{font-size:13px;color:#a8aab2}.tv-selected,.tv-connected{display:flex;gap:16px;align-items:center}.tv-selected>div,.tv-connected>div{flex:1;min-width:0;overflow-wrap:anywhere}.tv-connected{padding:0 0 20px;border-bottom:1px solid #ffffff18}.tv-connected span{color:#b8d4b1}.tv-actions{display:flex;flex-wrap:wrap;align-items:center;gap:12px}.tv-manual{font-size:14px}.tv-manual summary{cursor:pointer;padding:8px 0;min-height:44px;align-content:center}.tv-manual p{font-size:13px;margin:10px 0 16px}.tv-manual form,.tv-mac{display:grid;gap:10px}.tv-form-row{display:flex;gap:12px}.tv-form-row input{flex:1}.tv-manual dl{display:grid;grid-template-columns:auto 1fr;gap:10px;font-size:13px}.tv-manual dd{margin:0;font-family:monospace;overflow-wrap:anywhere}.tv-code label,.tv-mac label{font-size:14px}.tv-code .tv-pin{width:240px;font-size:36px;letter-spacing:12px;text-align:center;font-variant-numeric:tabular-nums;padding:14px}.tv-options .setting-row{padding-block:12px;gap:20px}.tv-startup{display:flex;align-items:center;gap:20px}.tv-startup p{font-size:13px}.tv-startup button{flex-shrink:0}.tv-test{display:grid;gap:14px;padding-block:4px}.tv-test small{font-size:12px;color:#989ba4}.tv-settings .tv-note{font-size:13px}.tv-error{color:#f1b5a9!important;border-left:2px solid #e49b88;padding-left:14px}.tv-message{color:#c5ddbd!important;border-left:2px solid #b8d4b1;padding-left:14px}@media(max-width:650px){.tv-settings{gap:20px}.tv-heading{gap:12px}.tv-heading h3{font-size:22px}.tv-heading>svg{flex-shrink:0}.tv-steps{gap:10px;justify-content:space-between}.tv-steps li{font-size:11px;gap:6px}.tv-steps li>span{width:23px;height:23px}.tv-form-row,.tv-startup{flex-direction:column;align-items:stretch}.tv-connected{flex-wrap:wrap}.tv-settings p{font-size:14px}.tv-connected .small-button{margin-left:44px}.tv-settings .tv-pin{font-size:30px;width:210px}}
</style>
