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
        if (cmd === "list_monitors") return [];
        if (cmd === "check_update") return { state: "disabled" };
        return null;
      },
    };
  });
  await page.reload();
  const card = (name) =>
    page
      .locator(".cards .app-card")
      .filter({ has: page.locator(".card-caption", { hasText: name }) });
  const dialog = () => page.getByRole("dialog");
  const assert = (ok, message) => {
    if (!ok) throw new Error(message);
  };
  const emit = async (action) => {
    await page.evaluate((a) => window.__qa.emit("input", a), action);
    await page.evaluate(() => new Promise(requestAnimationFrame));
  };
  const launches = () =>
    page.evaluate(
      () => window.__qa.calls.filter((c) => c.cmd === "launch_app").length,
    );
  const close = async () => {
    await page.keyboard.press("Escape");
    await dialog().waitFor({ state: "hidden" });
  };
  await card("Spotify").waitFor();
  await card("Spotify").focus();
  await page.keyboard.down("Enter");
  await page.waitForTimeout(200);
  assert((await launches()) === 0, "Launch happened on keydown");
  await page.keyboard.up("Enter");
  await page.waitForFunction(() =>
    window.__qa.calls.some((c) => c.cmd === "launch_app"),
  );
  assert((await launches()) === 1, "Short Enter must launch once");
  await page.evaluate(() => window.__qa.emit("sessions", []));
  await page.keyboard.down("Enter");
  await page.getByRole("dialog", { name: "Actions pour Spotify" }).waitFor();
  await page.keyboard.down("Enter"); // OS repeat cannot activate the menu.
  await page.keyboard.up("Enter");
  assert((await launches()) === 1, "Long Enter must not launch");
  assert(await dialog().isVisible(), "Release activated a menu item");
  await page.screenshot({ path: "output/playwright/quick-desktop.png" });
  await close();
  assert(
    await card("Spotify").evaluate((e) => e === document.activeElement),
    "Focus not restored",
  );
  // Navigation and focus loss cancel an incomplete hold.
  await page.keyboard.down("Enter");
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(700);
  await page.keyboard.up("Enter");
  assert(
    (await dialog().count()) === 0 && (await launches()) === 1,
    "Navigation failed to cancel",
  );
  await page.keyboard.down("Enter");
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.waitForTimeout(700);
  await page.keyboard.up("Enter");
  assert((await dialog().count()) === 0, "Blur failed to cancel");
  // Controller press/release follows the same route.
  await card("Internet").focus();
  await emit("accept-down");
  await emit("accept-up");
  await page.waitForFunction(
    () => window.__qa.calls.filter((c) => c.cmd === "launch_app").length === 2,
  );
  await page.evaluate(() => window.__qa.emit("sessions", []));
  await emit("accept-down");
  await dialog().waitFor();
  await emit("accept-up");
  assert((await launches()) === 2, "Long controller press launched");
  await emit("back");
  await dialog().waitFor({ state: "hidden" });
  await emit("accept-down");
  await emit("accept-cancel");
  await page.waitForTimeout(700);
  await emit("accept-up");
  assert(
    (await dialog().count()) === 0 && (await launches()) === 2,
    "Disconnect/cancel activated",
  );
  await emit("options");
  await dialog().waitFor();
  await close();
  // Right click targets the clicked card, then nested actions restore its focus.
  await card("Spotify").click({ button: "right" });
  await dialog().getByRole("button", { name: "Modifier", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Nom", exact: true })
    .fill("Spotify salon");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Actions pour Spotify salon" })
    .waitFor();
  await dialog().getByRole("button", { name: "Déplacer", exact: true }).click();
  await dialog()
    .getByRole("button", { name: "Déplacer après", exact: true })
    .click();
  await dialog()
    .getByRole("button", { name: "Déplacer après", exact: true })
    .click();
  assert(
    (await page.evaluate(() => window.__qa.config().apps[2].name)) ===
      "Spotify salon",
    "Move not saved",
  );
  assert(
    await page
      .getByRole("button", { name: "Terminé", exact: true })
      .evaluate((e) => e === document.activeElement),
    "Move boundary lost focus",
  );
  await page.keyboard.press("Enter");
  await close();
  assert(
    await card("Spotify salon").evaluate((e) => e === document.activeElement),
    "Move lost selected card",
  );
  await card("Spotify salon").click({ button: "right" });
  await dialog()
    .getByRole("button", { name: "Retirer la carte", exact: true })
    .click();
  assert(
    await page
      .getByRole("button", { name: "Annuler", exact: true })
      .evaluate((e) => e === document.activeElement),
    "Removal must focus cancel",
  );
  await page.keyboard.press("Enter");
  await dialog()
    .getByRole("button", { name: "Retirer la carte", exact: true })
    .click();
  await page.getByRole("button", { name: "Retirer", exact: true }).click();
  await dialog().waitFor({ state: "hidden" });
  assert((await card("Spotify salon").count()) === 0, "Removal failed");
  // Running / untracked sessions expose only the applicable actions.
  await page.evaluate(() =>
    window.__qa.emit("sessions", [
      {
        appId: "internet",
        name: "Internet",
        status: "running",
        canForce: true,
      },
    ]),
  );
  await card("Internet").click({ button: "right" });
  await dialog()
    .getByRole("button", { name: "Reprendre", exact: true })
    .click();
  await dialog()
    .getByRole("button", { name: "Fermer normalement", exact: true })
    .click();
  await dialog()
    .getByRole("button", { name: "Forcer la fermeture", exact: true })
    .click();
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  await page.evaluate(() =>
    window.__qa.emit("sessions", [
      {
        appId: "internet",
        name: "Internet",
        status: "untracked",
        canForce: false,
      },
    ]),
  );
  assert(
    await dialog()
      .getByRole("button", { name: "Reprendre", exact: true })
      .isDisabled(),
    "Untracked resume enabled",
  );
  assert(
    await dialog()
      .getByRole("button", { name: "Ne plus suivre", exact: true })
      .isVisible(),
    "Untracked label missing",
  );
  await close();
  // Grid, outside dismissal and touch in a real emulated touch surface.
  await card("Internet").focus();
  await page.keyboard.press("ArrowDown");
  await card("Internet").click({ button: "right" });
  await page.screenshot({ path: "output/playwright/quick-grid.png" });
  await page.mouse.click(1400, 30);
  await dialog().waitFor({ state: "hidden" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.__qa.emit("sessions", []));
  await card("Internet").focus();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true });
  const touch = async (type, x, y) =>
    cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints:
        type === "touchEnd" || type === "touchCancel" ? [] : [{ x, y }],
    });
  let rect = await card("Internet").boundingBox();
  await touch("touchStart", rect.x + rect.width / 2, rect.y + rect.height / 2);
  await dialog().waitFor();
  await touch("touchEnd");
  assert((await launches()) === 2, "Touch long press launched");
  const bounds = await dialog().boundingBox();
  assert(
    bounds.x >= 0 &&
      bounds.x + bounds.width <= 390 &&
      bounds.y + bounds.height <= 844,
    "Mobile menu outside viewport",
  );
  await page.screenshot({ path: "output/playwright/quick-mobile.png" });
  await close();
  rect = await card("Internet").boundingBox();
  await touch("touchStart", rect.x + 20, rect.y + 30);
  await touch("touchMove", rect.x + 65, rect.y + 30);
  await page.waitForTimeout(700);
  await touch("touchEnd");
  assert(
    (await dialog().count()) === 0 && (await launches()) === 2,
    "Touch scroll opened menu or launched",
  );
  rect = await card("Internet").boundingBox();
  await touch("touchStart", rect.x + 30, rect.y + 30);
  await touch("touchEnd");
  await page.waitForFunction(
    () => window.__qa.calls.filter((c) => c.cmd === "launch_app").length === 3,
  );
  await cdp.detach();
  assert(errors.length === 0, errors.join("\n"));
  return {
    result: "passed",
    viewports: ["1440x900", "390x844"],
    errors,
    launches: await launches(),
    nativeHardware: "not tested",
  };
}
