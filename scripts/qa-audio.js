// Isolated Chrome fixture: validates UI + IPC routing, never changes real audio/power.
async (page) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    const callbacks = new Map(),
      events = new Map();
    let next = 0;
    const config = {
      version: 1,
      apps: [],
      selectedId: null,
      settings: {
        fullscreen: true,
        autostart: false,
        monitor: null,
        scale: 1,
        motion: false,
        sound: false,
        deadzone: 0.24,
        returnShortcut: "startBack",
        holdMs: 1200,
      },
    };
    window.isTauri = true;
    window.__audioQA = {
      calls: [],
      fail: false,
      state: {
        outputs: [
          { id: "tv", name: "TV du salon (HDMI)" },
          { id: "headset", name: "Casque sans fil" },
        ],
        defaultId: "tv",
        volume: 64,
        muted: false,
      },
      emit(action) {
        callbacks.get(events.get("input"))?.({
          event: "input",
          id: 1,
          payload: action,
        });
      },
    };
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
      unregisterListener: (event) => events.delete(event),
    };
    window.__TAURI_INTERNALS__ = {
      transformCallback: (fn) => {
        callbacks.set(++next, fn);
        return next;
      },
      unregisterCallback: (id) => callbacks.delete(id),
      convertFileSrc: (p) => p,
      invoke: async (cmd, args = {}) => {
        const qa = window.__audioQA;
        qa.calls.push({ cmd, args });
        if (cmd === "plugin:event|listen") {
          events.set(args.event, args.handler);
          return args.handler;
        }
        if (cmd === "bootstrap")
          return {
            config,
            native: true,
            version: "0.1.0",
            warning: null,
            sessions: [],
            controller: "Xbox (QA fixture)",
          };
        if (cmd === "save_config") return args.config;
        if (cmd === "audio_state") return structuredClone(qa.state);
        if (cmd === "change_audio") {
          await new Promise((r) => setTimeout(r, 50));
          if (qa.fail) throw Error("Sortie déconnectée — erreur de test");
          const c = args.change;
          if (c.kind === "volume") qa.state.volume = c.value;
          if (c.kind === "mute") qa.state.muted = c.value;
          if (c.kind === "output") {
            qa.state.defaultId = c.id;
            qa.state.volume = 30;
          }
          return structuredClone(qa.state);
        }
        if (cmd === "check_update") return { state: "disabled" };
        return null;
      },
    };
  });
  await page.reload();
  const assert = (v, m) => {
    if (!v) throw Error(m);
  };
  const emit = async (action) => {
    await page.evaluate((a) => window.__audioQA.emit(a), action);
    await page.waitForTimeout(80);
  };
  const accept = async () => {
    await emit("accept-down");
    await emit("accept-up");
  };
  const dialog = page.getByRole("dialog", {
    name: "Commandes rapides",
    exact: true,
  });
  await page
    .getByRole("button", { name: "Commandes rapides", exact: true })
    .waitFor();
  await page.waitForFunction(() =>
    window.__audioQA.calls.some((call) => call.cmd === "audio_state"),
  );
  assert(
    await page.evaluate(() => {
      const calls = window.__audioQA.calls;
      const painted = calls.findIndex((call) => call.cmd === "frontend_painted");
      return painted >= 0 && painted < calls.findIndex((call) => call.cmd === "audio_state")
        && typeof calls[painted].args.timings.painted === "number";
    }),
    "Startup audio must wait until the first frames and timing report",
  );
  // Reach header with directional navigation only from the selected home card.
  const focusKey = () =>
    page.evaluate(
      () =>
        document.activeElement?.getAttribute("aria-label") ||
        document.activeElement?.textContent?.trim(),
    );
  await emit("home");
  await emit("up");
  await emit("up");
  for (let i = 0; i < 5 && (await focusKey()) !== "Commandes rapides"; i++)
    await emit("right");
  assert(
    (await focusKey()) === "Commandes rapides",
    "Audio button unreachable from cards: " + (await focusKey()),
  );
  await accept();
  await dialog.waitFor();
  await emit("down");
  assert(
    await page
      .locator("#quick-volume")
      .evaluate((el) => el === document.activeElement),
    "Volume not reached from close button",
  );
  await emit("right");
  await page.waitForFunction(() => window.__audioQA.state.volume === 66);
  assert(
    await page
      .locator("#quick-volume")
      .evaluate((el) => el === document.activeElement),
    "Volume lost focus",
  );
  await emit("down");
  await accept();
  await page.waitForFunction(() => window.__audioQA.state.muted);
  await emit("down"); // first output
  await emit("down"); // headset
  assert((await focusKey()).includes("Casque"), "Cannot navigate to headset");
  await accept();
  await page.waitForFunction(
    () => window.__audioQA.state.defaultId === "headset",
  );
  await page.screenshot({ path: "output/playwright/audio-desktop.png" });
  await emit("down"); // refresh
  await emit("down"); // sleep
  assert((await focusKey()).includes("Mettre en veille"), "Sleep unreachable");
  await accept();
  await page
    .getByRole("dialog", { name: "Mettre le PC en veille ?" })
    .waitFor();
  assert(
    (await focusKey()) === "Annuler",
    "Sleep confirmation must focus Cancel",
  );
  await emit("back");
  await dialog.waitFor();
  assert(
    (await focusKey()).includes("Mettre en veille"),
    "Sleep cancel did not restore focus",
  );
  assert(
    !(await page.evaluate(() =>
      window.__audioQA.calls.some((c) => c.cmd === "power_action"),
    )),
    "Sleep called without confirmation",
  );
  await emit("back");
  assert(
    (await focusKey()) === "Commandes rapides",
    "Panel close did not restore header focus",
  );
  await accept();
  // Keyboard follows the same navigation, slider needs no explicit edit mode.
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowLeft");
  await page.waitForFunction(() => window.__audioQA.state.volume === 28);
  await page.keyboard.press("Escape");
  assert(
    (await focusKey()) === "Commandes rapides",
    "B/Esc must close directly from slider",
  );
  await accept();
  // Error visible, retry stays available, state remains factual.
  await page.evaluate(() => (window.__audioQA.fail = true));
  await page.locator("#quick-volume").focus();
  await emit("right");
  await page.getByRole("alert").waitFor();
  assert(
    (await page.locator("#quick-volume").inputValue()) === "28",
    "Volume did not recover after failure",
  );
  await page.evaluate(() => (window.__audioQA.fail = false));
  await page.getByRole("button", { name: "Actualiser les sorties" }).click();
  await page.waitForFunction(() => !document.querySelector('[role="alert"]'));
  // Disconnect a focused output while the panel is open.
  await page
    .getByRole("button", { name: "Casque sans fil", exact: true })
    .focus();
  await page.evaluate(() => {
    window.__audioQA.state = {
      outputs: [],
      defaultId: null,
      volume: null,
      muted: false,
    };
  });
  await page.waitForFunction(() =>
    document.body.textContent.includes("Aucune sortie connectée"),
  );
  assert(
    await page.evaluate(
      () => !!document.activeElement.closest('[role="dialog"]'),
    ),
    "Focus lost after device removal",
  );
  assert(
    await page.locator("#quick-volume").isDisabled(),
    "No-device volume enabled",
  );
  await page.screenshot({ path: "output/playwright/audio-empty.png" });
  // Many long names, mobile bounds and scrolling.
  await page.evaluate(() => {
    window.__audioQA.state = {
      outputs: Array.from({ length: 9 }, (_, i) => ({
        id: "device-" + i,
        name: i
          ? "Casque Bluetooth sans fil — sortie audio secondaire " + i
          : "TV du salon (HDMI)",
      })),
      defaultId: "device-0",
      volume: 48,
      muted: false,
    };
  });
  await page.getByRole("button", { name: "Actualiser les sorties" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await dialog.locator('button[aria-label="Fermer"]').focus();
  await page.screenshot({ path: "output/playwright/audio-mobile.png" });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "Mobile horizontal overflow",
  );
  await page
    .getByRole("button", { name: "Mettre en veille", exact: true })
    .focus();
  await accept();
  await page
    .getByRole("dialog", { name: "Mettre le PC en veille ?" })
    .waitFor();
  await emit("right");
  await accept();
  await dialog.waitFor();
  assert(
    await page.evaluate(
      () =>
        window.__audioQA.calls.filter(
          (c) => c.cmd === "power_action" && c.args.action === "sleep",
        ).length === 1,
    ),
    "Confirmed sleep did not invoke the sleep command exactly once",
  );
  await emit("back");
  assert((await focusKey()) === "Commandes rapides", "Mobile close focus");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: "output/playwright/audio-header.png" });
  assert(errors.length === 0, errors.join("\n"));
  return {
    passed: true,
    controller: "IPC fixture only",
    errors,
    screenshots: ["audio-desktop.png", "audio-mobile.png", "audio-empty.png"],
  };
}
