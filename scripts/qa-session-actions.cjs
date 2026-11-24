// Run with Playwright on NODE_PATH and system Chrome. Windows requests are recorded in memory.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

async function verify(browser, url, viewport) {
  const context = await browser.newContext({ viewport });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      const callbacks = new Map(), events = new Map();
      let next = 0;
      const session = name => ({ appId: name, name, status: 'closing', canForce: true });
      const qa = window.qa = {
        calls: [], initial: ['Alpha', 'Beta'].map(session),
        emit: (event, payload) => callbacks.get(events.get(event))({ payload }),
      };
      window.isTauri = true;
      window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
      window.__TAURI_INTERNALS__ = {
        transformCallback(fn) { callbacks.set(++next, fn); return next; },
        unregisterCallback(id) { callbacks.delete(id); },
        convertFileSrc: path => path,
        async invoke(cmd, args = {}) {
          if (cmd === 'plugin:event|listen') { events.set(args.event, args.handler); return args.handler; }
          if (cmd === 'bootstrap') {
            const config = (await import('/src/lib/types.ts')).defaults();
            config.settings.locale = 'en';
            config.settings.motion = false;
            config.settings.sound = false;
            config.apps = ['Alpha', 'Beta'].map(name => ({
              id: name, name, source: 'Test', theme: 'home', card: null, background: null, icon: null,
              target: { kind: 'uri', value: 'https://example.test/' + name, workingDir: null, args: [] },
            }));
            config.settings.library.favorites = ['Beta'];
            return { config, native: true, sessions: qa.initial, controller: null, version: '0.11.1' };
          }
          if (cmd === 'save_config') return args.config;
          if (cmd === 'list_monitors') return [];
          if (cmd === 'audio_state') return { outputs: [], defaultId: null, volume: null, muted: false };
          if (cmd === 'check_update') return { state: 'disabled' };
          qa.calls.push({ cmd, args });
          return null;
        },
      };
    });
    await page.goto(url);
    await page.locator('.ready .app-card:focus').waitFor();
    const button = name => page.getByRole('button', { name, exact: true });
    const card = name => page.locator('[data-focus-key="app:' + name + '"]');
    const calls = command => page.evaluate(cmd => qa.calls.filter(c => c.cmd === cmd).map(c => c.args), command);

    await card('Alpha').click();
    await button('Force close').click();
    await page.getByRole('dialog', { name: 'Force close?' }).waitFor();
    await page.evaluate(() => qa.emit('sessions', [qa.initial[1]]));
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.deepEqual(await calls('close_app'), []);
    await card('Beta').click();
    await button('Force close').click();
    await page.getByRole('dialog', { name: 'Force close?' }).getByRole('button', { name: 'Force close' }).click();
    assert.deepEqual(await calls('close_app'), [{ id: 'Beta', force: true }]);
    await page.evaluate(() => qa.emit('sessions', []));
    await page.getByRole('dialog').waitFor({ state: 'hidden' });

    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
}

(async () => {
  const { createServer } = await import('vite');
  const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
  try {
    await server.listen();
    const browser = await chromium.launch({ channel: 'chrome' });
    try {
      for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }])
        await verify(browser, server.resolvedUrls.local[0], viewport);
      console.log('PASS: session actions on desktop and mobile');
    } finally { await browser.close(); }
  } finally { await server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
