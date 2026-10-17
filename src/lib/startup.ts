// Navigation-relative marks stay available in DevTools and are logged by Rust.
// They measure the frontend only, never Windows process creation or WebView startup.
const stages = [
  "entry", "mounted", "bootstrapStart", "bootstrapEnd",
  "subscribeStart", "subscribeEnd", "focused", "painted",
] as const;
type Stage = typeof stages[number];

export function startupMark(stage: Stage) {
  performance.mark(`canapey:${stage}`);
}

export function startupTimings(): Record<Stage, number | null> {
  return Object.fromEntries(stages.map((stage) => {
    const mark = performance.getEntriesByName(`canapey:${stage}`, "mark")[0];
    return [stage, mark ? Math.round(mark.startTime * 10) / 10 : null];
  })) as Record<Stage, number | null>;
}
