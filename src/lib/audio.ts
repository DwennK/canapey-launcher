import { computed, ref } from "vue";
import type { AudioChange, AudioState } from "./types";

// One IPC operation at a time. Consecutive slider changes coalesce; a slow read
// cannot overwrite newer input and queued volume always retains its device ID.
export function createAudioControls(api: {
  audioState: () => Promise<AudioState>;
  changeAudio: (change: AudioChange) => Promise<AudioState>;
}) {
  const state = ref<AudioState | null>(null);
  const error = ref("");
  const busy = ref(false);
  const volume = ref(0);
  const pending = ref<AudioChange[]>([]);
  const changingOutput = computed(() =>
    pending.value.some((c) => c.kind === "output"),
  );
  let active: AudioChange | null = null;
  const switching = ref(false);
  let refreshing: Promise<void> | null = null;
  let draining = false;
  function apply(value: AudioState) {
    state.value = value;
    const lastVolume = [...pending.value]
      .reverse()
      .find((c) => c.kind === "volume");
    volume.value =
      lastVolume?.kind === "volume" ? lastVolume.value : (value.volume ?? 0);
  }
  async function refresh(clearError = false) {
    if (refreshing) return refreshing;
    if (draining) return;
    if (clearError) error.value = "";
    busy.value = true;
    refreshing = (async () => {
      try {
        const value = await api.audioState();
        if (!state.value) error.value = "";
        apply(value);
      } catch (e) {
        state.value = null;
        error.value = String(e);
      } finally {
        refreshing = null;
        busy.value = false;
      }
    })();
    await refreshing;
  }
  async function drain() {
    if (draining) return;
    draining = true;
    if (refreshing) await refreshing;
    busy.value = true;
    try {
      while (pending.value.length) {
        active = pending.value.shift()!;
        switching.value = active.kind === "output";
        try {
          apply(await api.changeAudio(active));
          error.value = "";
        } catch (e) {
          error.value = String(e);
          pending.value = [];
          // Recover actual state without hiding the failed action.
          try {
            apply(await api.audioState());
          } catch {
            state.value = null;
          }
        }
      }
    } finally {
      active = null;
      switching.value = false;
      busy.value = false;
      draining = false;
    }
  }
  function change(value: AudioChange) {
    const last = pending.value.at(-1);
    if (
      value.kind === "volume" &&
      last?.kind === "volume" &&
      last.id === value.id
    )
      pending.value[pending.value.length - 1] = value;
    else pending.value.push(value);
    if (value.kind === "volume") volume.value = value.value;
    void drain();
  }
  function setVolume(value: number) {
    if (
      !state.value?.defaultId ||
      state.value.volume === null ||
      switching.value ||
      changingOutput.value
    )
      return;
    change({
      kind: "volume",
      id: state.value.defaultId,
      value: Math.round(Math.min(100, Math.max(0, value))),
    });
  }
  function toggleMute() {
    if (!state.value?.defaultId || busy.value) return;
    change({
      kind: "mute",
      id: state.value.defaultId,
      value: !state.value.muted,
    });
  }
  function setOutput(id: string) {
    if (busy.value || !state.value?.outputs.some((o) => o.id === id)) return;
    change({ kind: "output", id });
  }
  return {
    state,
    error,
    busy,
    volume,
    switching,
    refresh,
    setVolume,
    toggleMute,
    setOutput,
  };
}
