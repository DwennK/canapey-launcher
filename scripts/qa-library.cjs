// Run with Playwright on NODE_PATH and system Chrome installed.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

async function verify(browser, url, viewport, installed = false) {
  const context = await browser.newContext({ viewport });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(installed => {
      const key = 'canapey-ui-preview-v1';
      if (!localStorage.getItem(key)) {
        const apps = ['Zulu', 'Alpha', 'Netflix', 'Steam', ...(installed ? ['YouTube'] : [])]
          .map(name => ({
            id: name.toLowerCase(), name, theme: 'home', card: null, background: null, icon: null, source: 'Test',
            target: { kind: 'executable', value: 'C:/Apps/' + (name === 'YouTube' ? 'VacuumTube' : name) + '.exe', args: [], workingDir: null },
          }));
        localStorage.setItem(key, JSON.stringify({ version: 1, apps, selectedId: 'alpha',
          settings: { scale: 1, locale: 'en', motion: false, sound: false,
            library: { favorites: [], categories: {}, sort: 'custom' },
            remoteBindings: [{ button: 'library', action: 'library', key: { code: 'F8', ctrl: false, alt: false, shift: false }, global: false, appId: null }],
          },
        }));
      }
      window.configWrites = [];
      const write = Storage.prototype.setItem;
      Storage.prototype.setItem = function (name, value) {
        if (name === key && this === localStorage) window.configWrites.push(JSON.parse(value));
        return write.call(this, name, value);
      };
    }, installed);
    await page.goto(url);
    const selectedId = () => page.locator('.app-card:focus').getAttribute('data-focus-key');
    const writes = () => page.evaluate(() => window.configWrites.map(c => c.selectedId));
    await page.locator('.ready .app-card:focus').waitFor();
    assert.equal(await selectedId(), 'app:alpha');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowLeft');
    assert.equal(await selectedId(), 'app:netflix');
    await page.waitForFunction(() => window.configWrites.length > 0);
    assert.deepEqual(await writes(), ['netflix']);
    await page.reload();
    await page.locator('.ready .app-card:focus').waitFor();
    assert.equal(await selectedId(), 'app:netflix');
    await page.keyboard.press('ArrowLeft');
    await page.reload();
    await page.locator('.ready .app-card:focus').waitFor();
    assert.equal(await selectedId(), 'app:alpha');

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
      const url = server.resolvedUrls.local[0];
      await verify(browser, url, { width: 1440, height: 900 });
      await verify(browser, url, { width: 390, height: 844 }, true);
      console.log('PASS: selection writes and restoration.');
    } finally {
      await browser.close();
    }
  } finally {
    await server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
