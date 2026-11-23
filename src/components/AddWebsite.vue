<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import { t } from '../lib/i18n';
import { imageUrl, pickImage } from '../lib/bridge';
import { focusElement } from '../lib/navigation';
import { websiteEntry } from '../lib/website';
import type { Action, AppEntry } from '../lib/types';
import Icon from './Icon.vue';

const props = defineProps<{ native: boolean; library: AppEntry[]; save: (entries: AppEntry[]) => Promise<boolean> }>();
const emit = defineEmits<{ back: []; keyboard: [input: HTMLInputElement] }>();
const name = ref(''), address = ref(''), card = ref<string | null>(null);
const error = ref(''), saving = ref(false), picking = ref(false);
const addressInput = ref<HTMLInputElement>(), nameInput = ref<HTMLInputElement>();
const addButton = ref<HTMLButtonElement>(), imageButton = ref<HTMLButtonElement>();
let alive = true;
const host = computed(() => { try { return new URL(address.value).host; } catch { return ''; } });
function focusInitial() { focusElement(addressInput.value); }
function back() { if (!saving.value && !picking.value) emit('back'); }
function navigate(action: Action) {
  if (saving.value || picking.value) return true;
  if (action === 'back') { back(); return true; }
  return false;
}
async function chooseImage() {
  if (picking.value || saving.value || !props.native) return;
  picking.value = true;
  error.value = '';
  try {
    const path = await pickImage('card');
    if (alive && path) card.value = path;
  } catch (e) { if (alive) error.value = e instanceof Error ? e.message : String(e); }
  finally {
    picking.value = false;
    await nextTick();
    if (alive) focusElement(imageButton.value);
  }
}
async function submit() {
  if (saving.value || picking.value) return;
  error.value = '';
  let entry: AppEntry;
  try { entry = websiteEntry(name.value, address.value, card.value, props.library); }
  catch (e) { error.value = e instanceof Error ? e.message : String(e); return; }
  saving.value = true;
  try {
    if (!await props.save([entry]) && alive) error.value = t('Could not save your website. Try again.');
  } catch (e) { if (alive) error.value = e instanceof Error ? e.message : String(e); }
  finally {
    saving.value = false;
    await nextTick();
    if (alive) focusElement(addButton.value);
  }
}
onMounted(focusInitial);
onUnmounted(() => { alive = false; });
defineExpose({ navigate, focusInitial });
</script>

<template>
  <form class="website-form" aria-labelledby="website-title" novalidate @submit.prevent="submit">
    <header><h2 id="website-title">{{ t('Add website') }}</h2><p>{{ t('Open a favorite website in your default browser.') }}</p></header>
    <div class="website-body">
      <fieldset :disabled="saving || picking">
        <label for="website-url">{{ t('Web address') }}</label>
        <div class="website-input">
          <input id="website-url" ref="addressInput" v-model="address" type="text" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="https://example.com" aria-describedby="website-url-help" />
          <button type="button" :aria-label="t('Web address keyboard')" @click="addressInput && emit('keyboard', addressInput)"><Icon name="keyboard" :size="21" /></button>
        </div>
        <small id="website-url-help">{{ t('Use a full address starting with https:// or http://.') }}</small>
        <label for="website-name">{{ t('Name') }}</label>
        <div class="website-input">
          <input id="website-name" ref="nameInput" v-model="name" maxlength="100" autocomplete="off" :placeholder="t('My website')" />
          <button type="button" :aria-label="t('Name keyboard')" @click="nameInput && emit('keyboard', nameInput)"><Icon name="keyboard" :size="21" /></button>
        </div>
        <div class="website-artwork">
          <div class="website-preview" :aria-label="t('Card preview')">
            <img v-if="card" :src="imageUrl(card)" alt="" />
            <Icon v-else name="globe" :size="35" />
            <div><strong>{{ name.trim() || t('My website') }}</strong><span>{{ host || t('WEB SHORTCUT') }}</span></div>
          </div>
          <div class="website-artwork-actions">
            <strong>{{ t('Card image') }}</strong><small>{{ t('Optional · PNG, JPG or WebP.') }}</small>
            <button ref="imageButton" type="button" :disabled="!native" @click="chooseImage">{{ picking ? t('Choosing image…') : card ? t('Change image') : t('Choose image…') }}</button>
            <button v-if="card" type="button" class="website-remove" @click="card = null; nextTick(() => focusElement(imageButton))">{{ t('Remove image') }}</button>
            <small v-if="!native">{{ t('Image selection is available in the Windows app.') }}</small>
          </div>
        </div>
      </fieldset>
      <p v-if="error" class="website-error" role="alert">{{ error }}</p>
    </div>
    <footer>
      <button type="button" :disabled="saving || picking" @click="back">{{ t('Back') }}</button>
      <button ref="addButton" class="website-add" type="submit" :disabled="saving || picking">{{ saving ? t('Saving…') : t('Add website') }}</button>
    </footer>
  </form>
</template>

<style scoped>
.website-form { display: flex; flex-direction: column; min-height: 0; color: #f5f5f7; background: #222428; }
header { padding: 26px 28px 18px; }
h2 { margin: 0; font-size: calc(31px * var(--ui-scale)); font-weight: 640; letter-spacing: -.043em; }
header p { margin: 8px 0 0; color: #bdc0c6; font-size: calc(16px * var(--ui-scale)); line-height: 1.4; }
.website-body { overflow-y: auto; min-height: 0; padding: 0 28px 23px; }
fieldset { border: 0; padding: 0; margin: 0; min-width: 0; }
label { display: block; font-size: calc(16px * var(--ui-scale)); font-weight: 550; margin: 0 0 8px; }
label:not(:first-child) { margin-top: 20px; }
.website-input { display: flex; border: 1px solid #ffffff25; background: #17191c; border-radius: 10px; overflow: hidden; }
.website-input:focus-within { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
.website-input input { flex: 1; min-width: 0; height: 47px; border: 0; border-radius: 0; background: transparent; padding: 10px 12px; color: inherit; font: inherit; font-size: calc(17px * var(--ui-scale)); }
.website-input input:focus { outline: none; box-shadow: none; }
.website-input button { flex-shrink: 0; width: 46px; display: grid; place-items: center; color: #bdc0c6; }
small { display: block; font-size: 13px; color: #b4bac4; line-height: 1.45; }
#website-url-help { margin-top: 7px; }
.website-artwork { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 20px; margin-top: 24px; align-items: center; }
.website-preview { aspect-ratio: 16 / 9; background: #253c51; border: 1px solid #ffffff18; border-radius: 12px; overflow: hidden; position: relative; display: grid; place-items: center; color: #bfd5e8; }
.website-preview img { width: 100%; height: 100%; object-fit: cover; position: absolute; inset: 0; }
.website-preview > div { position: absolute; inset: auto 0 0; padding: 20px 12px 10px; background: linear-gradient(transparent, #0d1724eb); color: #fff; }
.website-preview strong, .website-preview span { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.website-preview strong { font-size: 17px; }.website-preview span { font-size: 12px; opacity: .75; margin-top: 3px; }
.website-artwork-actions { display: flex; flex-direction: column; align-items: start; gap: 5px; }
.website-artwork-actions > strong { font-size: 16px; font-weight: 550; }
.website-artwork-actions button, footer button { border-radius: 9px; padding: 10px 14px; min-height: 44px; background: #36393f; font-size: calc(15px * var(--ui-scale)); }
.website-artwork-actions button { margin-top: 5px; }
.website-artwork-actions .website-remove { background: transparent; color: #c4cad4; margin: 0; padding-block: 5px; }
.website-error { margin: 17px 0 0; color: #ffd1bf; font-size: 15px; overflow-wrap: anywhere; }
footer { display: flex; justify-content: space-between; gap: 12px; padding: 16px 28px; background: #1f2125; border-top: 1px solid #ffffff14; }
footer .website-add { color: var(--on-accent); background: var(--accent); font-weight: 600; }
button:disabled { opacity: .5; }
button:focus-visible, :root[data-input-mode=directional] button:focus { outline: 2px solid var(--focus-ring); outline-offset: -2px; }
@media(max-width:600px) { header { padding: 22px 18px 16px; }.website-body { padding: 0 18px 18px; }footer { padding: 14px 18px; }.website-artwork { gap: 12px; }.website-preview strong { font-size: 15px; }.website-preview span { font-size: 11px; } }
</style>
