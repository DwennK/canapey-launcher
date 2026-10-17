// Playwright CLI run-code script. Serve the two production builds on ports 4174/4175.
// Each run uses an isolated context; this measures Chrome frontend startup, not Windows/Tauri.
async (page) => {
  const browser = page.context().browser();
  const samples = [];
  const rounds = 12;
  for (const scenario of ["empty", "24-apps-last-selected"]) {
    for (let round = 0; round < rounds; round++) {
      // Alternate ordering to reduce warmup/host-load bias.
      for (const variant of round % 2 ? ["after", "before"] : ["before", "after"]) {
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "no-preference" });
        try {
          await context.addInitScript(({ scenario }) => {
            const apps = scenario === "empty" ? [] : Array.from({ length: 24 }, (_, i) => ({
              id: `app-${i}`, name: `Application ${i + 1}`, theme: "spotify",
              target: { kind: "uri", value: `https://example.com/${i}`, args: [], workingDir: null },
              card: null, background: null, icon: null, source: "Benchmark fixture",
            }));
            localStorage.setItem("canapey-ui-preview-v1", JSON.stringify({
              version: 1, apps, selectedId: apps.at(-1)?.id ?? null,
              settings: { fullscreen: true, autostart: false, monitor: null, scale: 1, motion: true, sound: false, deadzone: 0.24, returnShortcut: "xbox", holdMs: 1200 },
            }));
            const result = window.__startupBenchmark = {};
            let readyFrames = 0;
            function sample() {
              const root = document.querySelector(".launcher.ready");
              const selected = root?.querySelector('.cards [aria-pressed="true"]');
              const ready = selected && document.activeElement === selected;
              if (ready) {
                result.focusedMs ??= performance.now();
                if (++readyFrames >= 2) result.readyFramesMs ??= performance.now();
                const rect = selected.getBoundingClientRect();
                if (rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight) {
                  result.visibleSelectionMs ??= performance.now();
                  const bg = document.querySelector(".backdrop-current");
                  const expectedBg = scenario === "empty" ? "/art/home.webp" : "/art/spotify.webp";
                  const artwork = [...selected.querySelectorAll("img"), bg].every(img => img?.complete && img.naturalWidth > 0);
                  const animated = [...document.querySelectorAll(".hero, .backdrop")].some(el => el.getAnimations({ subtree: true }).some(a => a.playState === "running"));
                  if (artwork && bg?.getAttribute("src") === expectedBg && !animated && document.fonts.status === "loaded") result.settledMs ??= performance.now();
                }
              }
              if (result.readyFramesMs && result.settledMs) result.complete = true;
              else requestAnimationFrame(sample);
            }
            requestAnimationFrame(sample);
          }, { scenario });
          const testPage = await context.newPage();
          const errors = [];
          testPage.on("pageerror", error => errors.push(error.message));
          await testPage.goto(`http://127.0.0.1:${variant === "before" ? 4174 : 4175}/`);
          await testPage.waitForFunction(() => window.__startupBenchmark?.complete, undefined, { timeout: 10000 });
          const result = await testPage.evaluate(() => ({
            ...window.__startupBenchmark,
            initialJsBytes: performance.getEntriesByType("resource").filter(r => new URL(r.name).pathname.endsWith(".js")).reduce((sum, r) => sum + r.decodedBodySize, 0),
            initialCssBytes: performance.getEntriesByType("resource").filter(r => new URL(r.name).pathname.endsWith(".css")).reduce((sum, r) => sum + r.decodedBodySize, 0),
          }));
          if (errors.length) throw new Error(errors.join("; "));
          samples.push({ scenario, variant, round, ...result });
        } finally { await context.close(); }
      }
    }
  }
  const summaries = [];
  for (const scenario of ["empty", "24-apps-last-selected"]) for (const variant of ["before", "after"]) {
    const group = samples.filter(s => s.scenario === scenario && s.variant === variant);
    const summary = { scenario, variant, count: group.length };
    for (const metric of ["focusedMs", "readyFramesMs", "visibleSelectionMs", "settledMs", "initialJsBytes", "initialCssBytes"]) {
      const values = group.map(s => s[metric]).sort((a, b) => a - b);
      summary[metric] = { median: (values[5] + values[6]) / 2, p95: values[Math.ceil(values.length * 0.95) - 1] };
    }
    summaries.push(summary);
  }
  return { environment: "Chrome on macOS; fresh browser context per navigation, browser/OS already running; not native Windows cold start", browser: browser.version(), viewport: "1440x900", rounds, summaries, samples };
}
