<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { siloContinueWatching, type SiloCard } from '../lib/bridge';
import { t } from '../lib/i18n';
import { focusElement } from '../lib/navigation';

const props = defineProps<{ server: string }>();
const emit = defineEmits<{ resume: [id: string]; apps: []; library: [] }>();
const row = ref<HTMLElement>();
const cards = ref<SiloCard[]>([]);
let generation = 0;
let timer: ReturnType<typeof setTimeout>;
let disposed = false;

function buttons() {
  return Array.from(row.value?.querySelectorAll<HTMLButtonElement>('button') ?? []);
}
function enter(from?: Element | null) {
  const targets = buttons();
  if (!targets.length) return false;
  const center = (el: Element) => { const rect = el.getBoundingClientRect(); return rect.left + rect.width / 2; };
  const x = from ? center(from) : center(targets[0]!);
  focusElement(targets.reduce((best, el) => Math.abs(center(el) - x) < Math.abs(center(best) - x) ? el : best));
  return true;
}
function navigate(action: string) {
  const targets = buttons();
  const i = targets.indexOf(document.activeElement as HTMLButtonElement);
  if (i < 0) return false;
  if (action === 'up') emit('apps');
  else if (action === 'down') emit('library');
  else if (action === 'left' || action === 'right') focusElement(targets[i + (action === 'left' ? -1 : 1)]);
  else return false;
  return true;
}
async function refresh(attempt = 0) {
  clearTimeout(timer);
  const version = ++generation;
  if (!props.server || disposed) return;
  const result = await siloContinueWatching(props.server).catch(() => []);
  if (version !== generation || disposed) return;
  const focused = document.activeElement as HTMLButtonElement;
  const index = buttons().indexOf(focused);
  cards.value = result ?? [];
  await nextTick();
  if (index >= 0 && !focused.isConnected && document.activeElement === document.body) {
    if (cards.value.length) focusElement(buttons()[Math.min(index, cards.value.length - 1)]);
    else emit('apps');
  }
  // A newly created Silo window needs time to restore its session before its first read.
  const retry = result === null && attempt < 5;
  timer = setTimeout(() => {
    if (!document.hidden && document.hasFocus()) void refresh(retry ? attempt + 1 : 0);
  }, retry ? 1000 : 60000);
}
function onFocus() { void refresh(); }
watch(() => props.server, () => { cards.value = []; void refresh(); });
onMounted(() => { window.addEventListener('focus', onFocus); void refresh(); });
onUnmounted(() => { disposed = true; clearTimeout(timer); window.removeEventListener('focus', onFocus); });
defineExpose({ enter, navigate, refresh });
function episodeLabel(card: SiloCard) {
  if (card.season === null || card.episode === null) return card.title;
  return t('S{0}E{1} · {2}', [String(card.season).padStart(2, '0'), String(card.episode).padStart(2, '0'), card.title]);
}
</script>

<template>
  <section v-if="cards.length" ref="row" class="silo-row" aria-labelledby="silo-continue-heading">
    <h2 id="silo-continue-heading" class="library-heading section-label">{{ t('Continue watching on Silo') }}</h2>
    <div class="cards carousel">
      <button v-for="card in cards" :key="card.id" class="app-card silo-episode"
        :data-focus-key="'silo:' + card.id" :aria-label="t('Resume {0} · {1}% watched', [[card.series, episodeLabel(card)].filter(Boolean).join(' · '), card.percent])"
        @click="emit('resume', card.id)">
        <span class="card-visual">
          <img class="card-image" :src="card.image || '/art/silo-card.webp'" alt="" draggable="false" />
          <span class="silo-progress" aria-hidden="true"><i :style="{ width: card.percent + '%' }" /></span>
        </span>
        <span class="card-caption"><span>{{ card.series || card.title }}</span></span>
        <small v-if="card.series" class="silo-episode-detail">{{ episodeLabel(card) }}</small>
      </button>
    </div>
  </section>
</template>
