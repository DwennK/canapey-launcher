<script setup lang="ts">
defineProps<{ name: string; size?: number }>();
const paths: Record<string, string> = {
  home: "m3 10 9-7 9 7M5 9v12h5v-7h4v7h5V9",
  sofa: "M5 10V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3M5 14h14M5 18v2m14-2v2M3 10a2 2 0 0 1 2 2v2h14v-2a2 2 0 0 1 4 0v4a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2Z",
  settings:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm-2-5h4l.6 2.4 2.1 1.2L19 6l2 3.5-1.7 1.8v2.4L21 15.5 19 19l-2.3-.6-2.1 1.2L14 22h-4l-.6-2.4-2.1-1.2L5 19l-2-3.5 1.7-1.8v-2.4L3 9.5 5 6l2.3.6 2.1-1.2L10 3Z",
  plus: "M12 5v14M5 12h14",
  close: "m6 6 12 12M6 18 18 6",
  back: "m14 6-6 6 6 6",
  down: "m6 9 6 6 6-6",
  up: "m6 15 6-6 6 6",
  right: "m9 6 6 6-6 6",
  grid: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  play: "m8 5 11 7-11 7V5Z",
  check: "m5 12 4 4L19 6",
  search: "M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm5 12 6 6",
  power: "M12 2v10M6 5a9 9 0 1 0 12 0",
  monitor: "M3 4h18v13H3zM8 21h8m-4-4v4",
  controller:
    "M7 7h10c3 0 4 3 5 9 1 4-3 5-5 1H7c-2 4-6 3-5-1C3 10 4 7 7 7Zm-1 4v4m-2-2h4m8-1h.01M18 14h.01",
  edit: "m14 5 5 5M4 20l5-1L21 7l-5-5L4 14v6Z",
  folder: "M3 5h6l2 3h10v12H3V5Z",
  globe:
    "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 0c5 5 5 15 0 20-5-5-5-15 0-20ZM2 12h20",
  download: "M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5",
  update: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 16V8m-4 4 4-4 4 4",
  moon: "M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z",
  restart: "M21 12a9 9 0 1 1-9-9c2.5 0 4.9 1 6.7 2.7L21 8M21 3v5h-5",
  refresh:
    "M20 7v5h-5M4 17v-5h5M5 8a8 8 0 0 1 13-3l2 3M4 16l2 3a8 8 0 0 0 13-3",
  volume: "M4 9h4l5-4v14l-5-4H4V9Zm13-2a7 7 0 0 1 0 10",
  muted: "M4 9h4l5-4v14l-5-4H4V9Zm13 0 5 6m-5 0 5-6",
  info: "M12 8h.01M12 11v6M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z",
  trash: "M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7",
};
</script>
<template>
  <svg
    :width="size ?? 24"
    :height="size ?? 24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.6"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path :d="paths[name] ?? paths.info" />
  </svg>
</template>
