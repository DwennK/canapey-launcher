<script setup lang="ts">
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
  if (!props.native) return "Le test de détection nécessite Canapey sous Windows.";
  if (error.value) return error.value;
  if (!status.value) return "Vérification de la détection Xbox…";
  if (status.value.test === "detected") return "Touche Xbox détectée. Si Game Bar s’est aussi ouverte, désactivez son raccourci ci-dessous, puis refaites le test.";
  if (listening.value) return "Relâchez la touche Xbox, puis appuyez dessus. Écoute pendant 15 secondes, sans retour à l’accueil.";
  if (!status.value.available) return "Détection Xbox indisponible sur ce PC. Choisissez une combinaison de boutons dans le réglage ci-dessus.";
  if (!status.value.connected) return "Connectez une manette compatible Xbox pour effectuer le test.";
  if (status.value.test === "timeout") return "Aucun appui Xbox reçu. Vérifiez Game Bar et Steam Input, puis réessayez ou choisissez une combinaison de boutons.";
  return "Testez la touche Xbox avant de l’utiliser pour revenir à l’accueil.";
});

async function refresh() {
  try { status.value = await xboxHomeStatus(); }
  catch { error.value = "Impossible de lire la détection Xbox. Réouvrez les paramètres pour réessayer."; }
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
    <h4 id="xbox-home-title">Touche Xbox</h4>
    <p class="note" role="status" aria-live="polite">{{ message }}</p>
    <button class="small-button" :disabled="!native || busy || (!listening && (!status?.available || !status?.connected))" @click="toggleTest">
      {{ listening ? "Annuler le test Xbox" : "Tester la touche Xbox" }}
    </button>
    <div class="xbox-windows-help">
      <h4>Éviter l’ouverture de Game Bar</h4>
      <p class="note">Dans les paramètres Windows, désactivez l’option qui autorise la manette à ouvrir Game Bar. Canapey ouvre ce réglage ; vous choisissez de le désactiver. Game Bar reste accessible avec Windows + G.</p>
      <button class="small-button" :disabled="!native || listening" @click="openSettings">Ouvrir les paramètres Game Bar</button>
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
