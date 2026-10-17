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
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const keys = {
    left: "ArrowLeft",
    right: "ArrowRight",
    up: "ArrowUp",
    down: "ArrowDown",
    accept: "Enter",
    back: "Backspace",
    menu: "F1",
  };
  let driver = "keyboard";
  const send = async (action) => {
    if (driver === "keyboard") await page.keyboard.press(keys[action]);
    else
      await page.evaluate(
        (action) => window.__qa.emit("input", action),
        action,
      );
    // Let Vue apply focus/view changes before the next input; no fixed sleeps.
    await page.evaluate(() => new Promise(requestAnimationFrame));
  };
  const focused = () =>
    page.evaluate(() => document.activeElement?.getAttribute("data-qa-nav"));
  const report = [];
  // Build the actual arrow graph for every enabled control, without activating
  // controls. Then walk the discovered route with only arrow inputs and OK.
  let graph, labels, original;
  async function mapPanel(label) {
    await page.locator(".busy-pill").waitFor({ state: "hidden" });
    await page.waitForFunction(() => {
      const root = document.querySelector('[role="dialog"]');
      return (
        root &&
        !root.inert &&
        root.contains(document.activeElement) &&
        !document.activeElement.matches(":disabled")
      );
    });
    labels = await page.locator('[role="dialog"]').evaluate((root) => {
      root
        .querySelectorAll("[data-qa-nav]")
        .forEach((e) => e.removeAttribute("data-qa-nav"));
      const controls = [
        ...root.querySelectorAll("button,input,select,textarea"),
      ].filter(
        (e) =>
          !e.matches(":disabled") &&
          !e.closest("[inert]") &&
          e.getClientRects().length,
      );
      controls.forEach((e, i) => e.setAttribute("data-qa-nav", String(i)));
      return controls.map(
        (e) =>
          e.getAttribute("aria-label") ||
          e.labels?.[0]?.textContent.trim() ||
          e.textContent.trim(),
      );
    });
    original = await focused();
    graph = {};
    assert(
      original !== null,
      `${driver} ${label}: focus lost before navigation`,
    );
    for (let i = 0; i < labels.length; i++) {
      graph[i] = {};
      for (const action of ["left", "right", "up", "down"]) {
        await page.locator(`[role="dialog"] [data-qa-nav="${i}"]`).focus();
        await send(action);
        graph[i][action] = await focused();
      }
    }
    const visited = new Set([original]);
    const queue = [original];
    while (queue.length)
      for (const next of Object.values(graph[queue.shift()] || {})) {
        if (!visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
    const missing = labels
      .map((name, i) => (visited.has(String(i)) ? null : `${i}: ${name}`))
      .filter(Boolean);
    assert(
      !missing.length,
      `${driver} ${label}: unreachable ${missing.join(" | ")}`,
    );
    await page.locator(`[role="dialog"] [data-qa-nav="${original}"]`).focus();
    report.push({ driver, label, reachable: labels.length });
  }
  async function go(locator) {
    const goal = await locator.getAttribute("data-qa-nav");
    assert(goal !== null, "Target missing from navigation graph");
    for (let attempt = 0; attempt < 100; attempt++) {
      const start = await focused();
      if (start === goal) return;
      const queue = [[start, []]],
        visited = new Set([start]);
      let path;
      while (queue.length) {
        const [id, steps] = queue.shift();
        if (id === goal) {
          path = steps;
          break;
        }
        for (const [action, next] of Object.entries(graph[id] || {}))
          if (!visited.has(next)) {
            visited.add(next);
            queue.push([next, [...steps, action]]);
          }
      }
      assert(path?.length, `No route from ${start} to ${goal}`);
      await send(path[0]);
      // Nested list scrolling can alter geometric distances to outer controls.
      graph[start][path[0]] = await focused();
    }
    throw new Error(
      `Focus did not reach ${labels[goal]}; at ${await focused()}`,
    );
  }
  const button = (name) =>
    page.getByRole("dialog").getByRole("button", { name, exact: true });
  const category = (name) =>
    page
      .getByRole("navigation", { name: "Catégories des paramètres" })
      .getByRole("button", { name, exact: true });
  async function openCategory(name) {
    await mapPanel("settings before " + name);
    await go(category(name));
    await send("accept");
    await mapPanel(name);
  }
  for (const mode of ["keyboard", "controller-events"]) {
    driver = mode;
    await page.reload();
    await page.getByRole("heading", { name: "Spotify", exact: true }).waitFor();
    assert(
      (await page.locator(".hints kbd").first().textContent()) === "A",
      "Xbox incorrectly labelled as PlayStation",
    );
    await send("right");
    await send("down");
    assert(
      (await page
        .locator('.cards.grid .app-card[aria-pressed="true"]')
        .getAttribute("aria-label")) === "Internet",
      "Grid lost selection",
    );
    await send("back");
    assert(
      await page.locator(".cards.carousel").isVisible(),
      "Back did not return to carousel",
    );
    // Header, hero and footer are reached using arrows, with no Tab or click.
    await send("up");
    await send("up");
    assert(
      await page.evaluate(() => !!document.activeElement.closest("header")),
      "Header unreachable",
    );
    for (let i = 0; i < 5 && await page.evaluate(() => document.activeElement.getAttribute("aria-label")) !== "Commandes rapides"; i++) await send("right");
    assert(
      (await page.evaluate(() =>
        document.activeElement.getAttribute("aria-label"),
      )) === "Commandes rapides",
      "Quick controls unreachable from header",
    );
    await send("right");
    assert(
      (await page.evaluate(() =>
        document.activeElement.getAttribute("aria-label"),
      )) === "Paramètres",
      "Settings unreachable from header",
    );
    await send("accept");
    await mapPanel("Écran & démarrage");
    const full = page.getByRole("switch", { name: /Plein écran/ });
    await go(full);
    const checked = await full.isChecked();
    await send("accept");
    assert((await full.isChecked()) !== checked, "OK did not toggle switch");
    if (mode === "keyboard") {
      await page.keyboard.down("Enter");
      await page.keyboard.down("Enter");
      await page.keyboard.up("Enter");
      assert((await full.isChecked()) === checked, "Held Enter toggled twice");
    }
    const range = page.getByRole("slider", { name: /Taille de l’interface/ });
    await go(range);
    const value = await range.inputValue();
    await send("left");
    assert((await range.inputValue()) === value, "Navigation changed slider");
    await go(range);
    await send("accept");
    await send("right");
    await send("accept");
    assert(
      Number(await range.inputValue()) > Number(value),
      "Slider edit failed",
    );
    await mapPanel("Écran after scale change");
    await openCategory("Manettes");
    const combo = page.getByRole("combobox", { name: /Retour global/ });
    await go(combo);
    await send("accept");
    await send("right");
    await send("accept");
    assert(
      (await combo.inputValue()) === "shouldersStart",
      "Select edit failed",
    );
    await openCategory("Applications");
    await go(button("Avancer Internet"));
    await send("accept");
    assert(
      (await page.evaluate(() => document.activeElement.dataset.focusKey)) ===
        "internet:name",
      "Reorder lost focus on a now-disabled arrow",
    );
    await mapPanel("Applications reordered");
    await go(button("Reculer Internet"));
    await send("accept");
    await mapPanel("Applications original order");
    await go(button("Modifier Internet"));
    await send("accept");
    await mapPanel("URI editor");
    const name = page.getByRole("textbox", { name: "Nom", exact: true });
    await go(name);
    await send("down");
    assert(
      !(await name.evaluate((e) => e === document.activeElement)),
      "Text field traps arrows",
    );
    await go(name);
    await send("accept");
    await page.keyboard.press("End");
    await page.keyboard.type("X");
    await page.keyboard.press("Backspace");
    assert(
      (await name.inputValue()) === "Internet",
      "Backspace did not delete while editing",
    );
    assert(
      await page
        .getByRole("dialog", { name: "Personnaliser une application" })
        .isVisible(),
      "Typing Backspace closed editor",
    );
    await send("accept");
    if (mode === "keyboard") {
      await page.keyboard.down("Backspace");
      await page.keyboard.down("Backspace");
      await page.keyboard.up("Backspace");
    } else await send("back");
    assert(
      (await page.evaluate(() =>
        document.activeElement.getAttribute("aria-label"),
      )) === "Modifier Internet",
      "Editor did not restore origin focus",
    );
    await mapPanel("Applications restored");
    await go(button("Modifier Application QA"));
    await send("accept");
    await mapPanel("Executable editor with arguments");
    await go(button("Retirer"));
    await send("accept");
    await mapPanel("Remove confirmation");
    assert(
      (await page.evaluate(() => document.activeElement.textContent.trim())) ===
        "Annuler",
      "Confirmation must focus Cancel",
    );
    await send("back");
    assert(
      (
        await page.evaluate(() => document.activeElement.textContent.trim())
      ).includes("Retirer"),
      "Cancel did not restore remove trigger",
    );
    await send("back");
    await mapPanel("Applications after cancel");
    await go(button("Ajouter"));
    await send("accept");
    await mapPanel("Import before scan");
    await go(button("Détecter mes applications"));
    await send("accept");
    await page.locator(".detected-app").first().waitFor();
    await mapPanel("Import with long results");
    await go(page.locator(".detected-app").first());
    await send("accept");
    assert(
      (await page
        .locator(".detected-app")
        .first()
        .getAttribute("aria-pressed")) === "true",
      "Import selection not toggled",
    );
    await mapPanel("Import multi-select");
    await go(button("Parcourir"));
    await send("accept");
    await mapPanel("Manual import editor");
    await send("back");
    assert(
      (await page.evaluate(() => document.activeElement.textContent.trim())) ===
        "Parcourir",
      "Manual editor returned to wrong parent",
    );
    await mapPanel("Import restored after manual cancel");
    // Tab remains trapped, too, including Shift+Tab from the first control.
    await go(button("Fermer"));
    await page.keyboard.press("Shift+Tab");
    assert(
      await page.evaluate(
        () => !!document.activeElement.closest('[role="dialog"]'),
      ),
      "Tab escaped dialog",
    );
    await send("back");
    assert(
      (await page.evaluate(() => document.activeElement.textContent.trim())) ===
        "Ajouter",
      "Add Back did not restore settings",
    );
    await openCategory("Mises à jour");
    await go(button("Rechercher une mise à jour"));
    await send("accept");
    await button("Télécharger et installer").waitFor();
    await mapPanel("Available update");
    await go(button("Télécharger et installer"));
    await send("accept");
    await mapPanel("Update confirmation");
    await send("back");
    await mapPanel("Updates restored");
    await openCategory("Diagnostic");
    await go(button("Quitter Canapey"));
    await send("accept");
    await mapPanel("Quit confirmation");
    await send("back");
    await mapPanel("Diagnostic restored");
    await go(category("Alimentation"));
    await send("accept");
    await mapPanel("Power");
    await go(button("Éteindre"));
    await send("accept");
    await mapPanel("Power confirmation");
    await send("back");
    assert(
      (await page.evaluate(() => document.activeElement.textContent.trim())) ===
        "Éteindre",
      "Power confirm lost focus",
    );
    await send("back");
    assert(
      await page.getByRole("dialog", { name: "Paramètres" }).isVisible(),
      "Power Back skipped settings",
    );
    await send("back");
    assert(
      (await page.evaluate(() =>
        document.activeElement.getAttribute("aria-label"),
      )) === "Paramètres",
      "Settings lost header origin",
    );
    await send("back");
    await send("up");
    await send("up");
    for (let i = 0; i < 8 && await page.evaluate(() => document.activeElement.getAttribute("aria-label")) !== "Alimentation"; i++) await send("right");
    assert(
      (await page.evaluate(() =>
        document.activeElement.getAttribute("aria-label"),
      )) === "Alimentation",
      "Header power unreachable from grid",
    );
    await send("accept");
    await send("back");
    assert(
      (await page.evaluate(() =>
        document.activeElement.getAttribute("aria-label"),
      )) === "Alimentation",
      "Header power focus not restored",
    );
    await send("up");
    await send("back");
    await send("left");
    await send("left");
    await send("accept");
    await send("accept");
    assert(await page.evaluate(() => window.__qa.calls.some(call => call.cmd === "resume_app")), "Short press did not resume the active app");
    if (driver === "keyboard") {
      await page.keyboard.down("Enter");
      await page.locator('.quick-panel').waitFor();
      await page.keyboard.up("Enter");
    } else {
      await send("options");
    }
    await mapPanel("Active session actions");
    await go(button("Forcer la fermeture"));
    await send("accept");
    await mapPanel("Force-close confirmation");
    await send("back");
    await send("back");
    await page.evaluate(() =>
      window.__qa.emit("sessions", [
        {
          appId: window.__qa.config().selectedId,
          name: "Session QA",
          status: "untracked",
          canForce: false,
        },
      ]),
    );
    await send("accept");
    await mapPanel("Shared-window session with disabled Resume");
    await send("back");
    await page.evaluate(() =>
      window.__qa.emit("sessions", [
        {
          appId: "test",
          name: "Application QA",
          status: "closing",
          canForce: true,
        },
        {
          appId: "spotify",
          name: "Spotify",
          status: "untracked",
          canForce: false,
        },
      ]),
    );
    await send("menu");
    await openCategory("Diagnostic");
    await mapPanel("Diagnostic active and shared sessions");
    await send("back");
    await page.evaluate(() => window.__qa.emit("controller", "Sony DualSense"));
    assert(
      (await page.locator(".hints kbd").first().textContent()) === "×",
      "PlayStation hint missing",
    );
    const calls = await page.evaluate(() => window.__qa.calls);
    assert(
      !calls.some((c) =>
        ["power_action", "quit", "install_update", "close_app"].includes(c.cmd),
      ),
      "A dangerous confirmation was activated",
    );
  }
  // Responsive panel graph, with text fields and wrapping controls.
  driver = "keyboard";
  await page.reload();
  await page.getByRole("heading", { name: "Spotify", exact: true }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await send("menu");
  await mapPanel("mobile general");
  await openCategory("Applications");
  await go(button("Modifier Internet"));
  await send("accept");
  await mapPanel("mobile editor");
  await send("back");
  await mapPanel("mobile apps");
  await go(button("Ajouter"));
  await send("accept");
  await mapPanel("mobile import");
  await page.screenshot({
    animations: "disabled",
    path: "output/playwright/controls-mobile.png",
  });
  assert(errors.length === 0, errors.join("\n"));
  return {
    result: "passed",
    nativeHardware: "not tested; IPC fixture only",
    errors,
    report,
  };
}
