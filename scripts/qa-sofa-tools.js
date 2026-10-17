// Isolated Chrome QA with an IPC fixture. No native Windows app is launched.
async (page) => {
  const errors = [];
  // Clear touch emulation left by a previous interrupted run.
  const initialCdp = await page.context().newCDPSession(page);
  await initialCdp.send("Emulation.setTouchEmulationEnabled", {
    enabled: false,
  });
  await initialCdp.detach();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    const callbacks = new Map(),
      events = new Map();
    let id = 0;
    let config = {
      version: 1,
      selectedId: "spotify",
      apps: ["Spotify", "Internet", "Netflix"].map((name) => ({
        id: name.toLowerCase(),
        name,
        theme: name.toLowerCase(),
        target: {
          kind: "uri",
          value: "https://example.com/" + name,
          args: [],
          workingDir: null,
        },
        card: null,
        background: null,
        icon: null,
        source: "QA",
      })),
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
    window.__qa = {
      calls: [],
      resumeError: null,
      config: () => config,
      emit: (event, payload) =>
        callbacks.get(events.get(event))?.({ event, payload }),
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
      convertFileSrc: (p) => p,
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
            sessions: [],
            controller: "Xbox QA",
            warning: null,
          };
        if (cmd === "save_config") {
          config = structuredClone(args.config);
          return config;
        }
        if (cmd === "launch_app")
          return {
            appId: args.id,
            name: args.id,
            status: "running",
            canForce: false,
          };
        if (cmd === "resume_app" && window.__qa.resumeError)
          throw new Error(window.__qa.resumeError);
        if (cmd === "list_monitors") return [];
        if (cmd === "check_update") return { state: "disabled" };
        return null;
      },
    };
  });
  await page.reload();
  const assert = (value, message) => {
    if (!value) throw new Error(message);
  };
  const emit = async (action) => {
    await page.evaluate((action) => window.__qa.emit("input", action), action);
    await page.evaluate(() => new Promise(requestAnimationFrame));
  };
  const checkKeyboardNavigation = async () => {
    const missing = await page.evaluate(async () => {
      const root = document.querySelector(".keyboard-panel");
      const items = [...root.querySelectorAll("button,textarea")];
      const original = document.activeElement;
      const graph = [];
      for (const item of items) {
        const edges = [];
        for (const direction of ["left", "right", "up", "down"]) {
          item.focus();
          window.__qa.emit("input", direction);
          edges.push(items.indexOf(document.activeElement));
        }
        graph.push(edges);
      }
      const visited = new Set([items.indexOf(original)]);
      const queue = [...visited];
      while (queue.length) for (const index of graph[queue.shift()] ?? []) {
        if (!visited.has(index)) { visited.add(index); queue.push(index); }
      }
      original.focus();
      return items.filter((_, i) => !visited.has(i)).map((item) => item.getAttribute("aria-label") || item.textContent);
    });
    assert(!missing.length, `Keyboard controls unreachable by controller: ${missing.join(", ")}`);
  };
  const keyboard = () => page.getByRole("dialog", { name: /^Clavier —/ });
  const accept = async () => {
    await emit("accept-down");
    await emit("accept-up");
  };
  const tap = async (name) =>
    keyboard().getByRole("button", { name, exact: true }).click();
  await page.locator(".app-card").first().waitFor();
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.getByRole("button", { name: "Paramètres", exact: true }).click();
    await page
      .getByRole("button", { name: "Applications", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Paramètres", exact: true })
      .getByRole("button", { name: "Ajouter", exact: true })
      .click();
    const search = page.getByRole("searchbox", {
      name: "Rechercher une application",
      exact: true,
    });
    await search.focus();
    await accept();
    await keyboard().waitFor();
    assert(
      await keyboard()
        .getByRole("button", { name: "Saisir a", exact: true })
        .evaluate((e) => e === document.activeElement),
      "Keyboard must initially focus A",
    );
    await checkKeyboardNavigation();
    await accept();
    await emit("right");
    await accept();
    await tap("Saisir é");
    await tap("Espace");
    await tap("Maj.");
    await tap("Saisir B");
    await tap("123 / @");
    await checkKeyboardNavigation();
    await tap("Saisir 2");
    await tap("Effacer");
    assert(
      (await keyboard().getByRole("textbox").inputValue()) === "azé B",
      "Controller typing, accents or backspace failed",
    );
    const bounds = await keyboard().boundingBox();
    assert(
      bounds.x >= 0 &&
        bounds.x + bounds.width <= viewport.width &&
        bounds.y >= 0 &&
        bounds.y + bounds.height <= viewport.height,
      "Keyboard outside viewport",
    );
    await page.screenshot({
      path: `output/playwright/keyboard-${viewport.width}.png`,
    });
    await tap("Terminé");
    await keyboard().waitFor({ state: "hidden" });
    assert(
      (await search.inputValue()) === "azé B",
      "Search did not receive draft",
    );
    assert(
      await search.evaluate((e) => e === document.activeElement),
      "Search focus not restored",
    );
    await accept();
    await keyboard().waitFor();
    await tap("Saisir a");
    await emit("back");
    await keyboard().waitFor({ state: "hidden" });
    assert(
      (await search.inputValue()) === "azé B",
      "Cancel changed original field",
    );
    // Physical typing remains available after leaving the on-screen keyboard.
    await search.fill("Steam");
    await page.keyboard.press("Backspace");
    assert(
      (await search.inputValue()) === "Stea",
      "Physical Backspace navigated away",
    );
    await page
      .getByRole("dialog", { name: "Ajouter des applications", exact: true })
      .getByRole("button", { name: "Fermer", exact: true })
      .click();
    // Rename through the explicit keyboard button, preserving selection and limit.
    await page
      .getByRole("button", { name: "Modifier Spotify", exact: true })
      .click();
    const name = page.getByRole("textbox", { name: "Nom", exact: true });
    await name.evaluate((e) => e.setSelectionRange(0, e.value.length));
    await page
      .getByRole("button", { name: "Clavier pour le nom", exact: true })
      .click();
    await tap("Saisir é");
    await tap("Saisir t");
    await tap("Saisir é");
    await tap("Terminé");
    assert((await name.inputValue()) === "été", "Selection replacement failed");
    await page
      .getByRole("button", { name: "Enregistrer", exact: true })
      .click();
    assert(
      (await page.evaluate(() => window.__qa.config().apps[0].name)) === "été",
      "Rename not saved",
    );
    // Restore fixture name for the second viewport.
    await page
      .getByRole("button", { name: "Modifier été", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "Nom", exact: true })
      .fill("Spotify");
    await page
      .getByRole("button", { name: "Enregistrer", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Test de la manette", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Démarrer le test", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Arrêter le test", exact: true })
      .waitFor();
    await page.evaluate(() =>
      window.__qa.emit("controller-snapshot", {
        name: "Xbox Wireless Controller",
        axes: [0.6, -0.2, -0.4, 0.8],
        triggers: [0.25, 0.75],
        buttons: ["south", "lb"],
        direction: "right",
      }),
    );
    assert(
      await page
        .locator('[data-button="south"]')
        .evaluate((e) => e.classList.contains("pressed")),
      "Button telemetry missing",
    );
    assert(
      await page.getByText("X 0.60 · Y -0.20", { exact: true }).isVisible(),
      "Stick telemetry missing",
    );
    assert(
      await page.getByText("Droite", { exact: true }).isVisible(),
      "Filtered direction missing",
    );
    await emit("menu");
    await emit("back");
    await emit("accept-down");
    await emit("accept-up");
    assert(
      await page
        .getByRole("button", { name: "Arrêter le test", exact: true })
        .isVisible(),
      "Test inputs triggered navigation",
    );
    await page.screenshot({
      path: `output/playwright/controller-test-${viewport.width}.png`,
    });
    assert(await page.locator('[data-button="south"]').textContent() === "A", "Xbox Wireless Controller mislabeled as PlayStation");
    // Disconnection clears old values; reconnection can display another controller.
    await page.evaluate(() =>
      window.__qa.emit("controller-snapshot", {
        name: null,
        axes: [0, 0, 0, 0],
        triggers: [0, 0],
        buttons: [],
        direction: null,
      }),
    );
    assert(
      await page
        .getByText("En attente d’une manette…", { exact: true })
        .isVisible(),
      "Disconnect state missing",
    );
    assert(
      (await page.locator(".test-buttons .pressed").count()) === 0,
      "Disconnected buttons remain pressed",
    );
    await page.evaluate(() =>
      window.__qa.emit("controller-snapshot", {
        name: "DualSense",
        axes: [0, 0, 0, 0],
        triggers: [0, 0],
        buttons: ["east"],
        direction: null,
      }),
    );
    assert(
      (await page.locator('[data-button="east"]').textContent()) === "Rond",
      "PlayStation labels missing",
    );
    await page.evaluate(() => window.__qa.emit("controller-test-ended", null));
    await page
      .getByRole("button", { name: "Démarrer le test", exact: true })
      .waitFor();
    const before = await page.evaluate(
      () => window.__qa.config().settings.deadzone,
    );
    await page
      .getByRole("button", { name: "Augmenter la zone neutre", exact: true })
      .click();
    assert(
      Math.abs(
        (await page.evaluate(() => window.__qa.config().settings.deadzone)) -
          before -
          0.05,
      ) < 0.001,
      "Deadzone not saved",
    );
    await page
      .getByRole("button", { name: "Démarrer le test", exact: true })
      .click();
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { name: "Démarrer le test", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Démarrer le test", exact: true })
      .click();
    await page.mouse.click(2, 2);
    assert(
      (await page.evaluate(
        () =>
          window.__qa.calls
            .filter((c) => c.cmd === "set_controller_test")
            .at(-1).args.enabled,
      )) === false,
      "Leaving settings did not end capture",
    );
    await page
      .getByRole("dialog", { name: "Paramètres", exact: true })
      .waitFor({ state: "hidden" });
  }
  assert(errors.length === 0, errors.join("\n"));
  return {
    result: "passed",
    viewports: ["1440x900", "390x844"],
    errors,
    nativeHardware: "not tested; IPC fixtures only",
  };
}
