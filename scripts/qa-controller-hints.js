// Run with Playwright CLI in an isolated Chrome session. The IPC fixture below
// tests frontend routing only: it never invokes Windows or claims hardware QA.
async (page) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    const app = (id, name, kind, value, theme = "home") => ({
      id,
      name,
      theme,
      target: { kind, value, args: [], workingDir: null },
      card: null,
      background: null,
      icon: null,
      source: "QA fixture",
    });
    let config = {
      version: 1,
      selectedId: "spotify",
      apps: [
        app(
          "spotify",
          "Spotify",
          "uri",
          "https://open.spotify.com/",
          "spotify",
        ),
        app(
          "internet",
          "Internet",
          "uri",
          "https://www.google.com/",
          "internet",
        ),
        app("test", "Application QA", "executable", "C:\\QA\\App.exe"),
      ],
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
    const callbacks = new Map(),
      events = new Map();
    let id = 0;
    window.isTauri = true;
    window.__qa = {
      calls: [],
      emit(event, payload) {
        callbacks.get(events.get(event))?.({ event, id: 1, payload });
      },
      config: () => config,
    };
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
      unregisterListener: (event) => events.delete(event),
    };
    window.__TAURI_INTERNALS__ = {
      transformCallback: (fn) => {
        callbacks.set(++id, fn);
        return id;
      },
      unregisterCallback: (id) => callbacks.delete(id),
      convertFileSrc: (path) => path,
      invoke: async (cmd, args = {}) => {
        window.__qa.calls.push({ cmd, args });
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
            controller: "Xbox Wireless Controller (QA fixture)",
          };
        if (cmd === "audio_state")
          return { outputs: [], defaultId: null, volume: null, muted: false };
        if (cmd === "save_config") {
          config = structuredClone(args.config);
          return config;
        }
        if (cmd === "list_monitors")
          return [{ id: "tv", name: "TV QA", primary: false }];
        if (cmd === "scan_apps")
          return Array.from({ length: 12 }, (_, i) =>
            app(
              "found-" + i,
              i ? `Lecteur QA ${i}` : "Spotify",
              "executable",
              `C:\\QA\\Found${i}.exe`,
            ),
          );
        if (cmd === "pick_application")
          return app(
            "manual",
            "Application manuelle QA",
            "executable",
            "C:\\QA\\Manual.exe",
          );
        if (cmd === "check_update") {
          await new Promise((resolve) => setTimeout(resolve, 80));
          return {
            state: "available",
            version: "0.1.1-test",
            notes: "Fixture de validation — aucune installation réelle.",
          };
        }
        if (cmd === "launch_app")
          return {
            appId: args.id,
            name: config.apps.find((a) => a.id === args.id).name,
            status: "running",
            canForce: true,
          };
        if (cmd === "pick_image") return null;
        return null;
      },
    };
  });
  await page.reload();
  await page.getByRole("heading", { name: "Spotify", exact: true }).waitFor();
  const assert = (value, message) => { if (!value) throw new Error(message); };
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
    for (const [name, family, expected] of [
      [null, 'keyboard', ['↵', '⌫ / esc', 'F1']],
      ['Xbox Wireless Controller', 'xbox', ['A', 'B', '☰']],
      ['DualSense Wireless Controller', 'playstation', ['×', '○', 'Options']],
      ['Nintendo Switch Pro Controller', 'nintendo', ['B', 'A', '+']],
    ]) {
      await page.evaluate(name => window.__qa.emit('controller', name), name);
      await page.waitForFunction(family => document.querySelector('.hints')?.dataset.controllerFamily === family, family);
      const actual = await page.locator('.hints kbd').allTextContents();
      assert(JSON.stringify(actual) === JSON.stringify(expected), `${family}: wrong hints ${actual}`);
      assert(await page.locator('.top-right .controller-status').count() === 0, 'Indicator still in header');
      const bounds = await page.locator('.hints').evaluate(el => {
        const icon = el.querySelector('.controller-status').getBoundingClientRect();
        const key = el.querySelector('kbd').getBoundingClientRect();
        const rect = el.getBoundingClientRect();
        return { visible: icon.width > 0, before: icon.right < key.left, bottom: rect.bottom, right: rect.right, viewport: innerWidth, height: innerHeight };
      });
      assert(bounds.visible && bounds.before && bounds.right <= bounds.viewport && bounds.bottom <= bounds.height, `${family}/${width}: footer layout ${JSON.stringify(bounds)}`);
      await page.locator('.overlay').waitFor({ state: 'detached' });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await page.screenshot({ path: `output/playwright/hints-${family}-${width}.png` });
      await page.getByRole('button', { name: 'Paramètres', exact: true }).click();
      assert((await page.locator('.panel-footer kbd').textContent()).trim() === expected[1], 'Panel back legend mismatch');
      await page.getByRole('button', { name: 'Test de la manette', exact: true }).click();
      await page.locator('[data-controller-test-toggle]').waitFor();
      if (name) {
        assert((await page.locator('[data-button=south]').textContent()).trim() === expected[0], 'Diagnostic button mismatch');
      }
      await page.getByRole('button', { name: 'Fermer', exact: true }).click();
    }
  }
  assert(errors.length === 0, `Page errors: ${errors.join(', ')}`);
  return ('PASS: 4 input families, connection/disconnection, header/footer placement, menus and diagnostic labels at 1440x900 and 390x844; no page errors.');
}
