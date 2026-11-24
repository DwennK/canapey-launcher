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
    const card = id => page.locator('[data-focus-key="app:' + id + '"]');
    const selectedId = () => page.locator('.app-card:focus').getAttribute('data-focus-key');
    const writes = () => page.evaluate(() => window.configWrites.map(c => c.selectedId));
    const ids = () => page.locator('.app-card').evaluateAll(cards => cards.map(c => c.dataset.focusKey.slice(4)));
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

    await card('library').click();
    const search = page.getByRole('searchbox');
    const sort = page.getByRole('combobox', { name: 'Sort' });
    const filter = name => page.getByRole('button', { name, exact: true });
    const youtube = installed ? 'youtube' : 'catalog-youtube';
    const custom = ['zulu', 'alpha', 'netflix', 'steam', youtube, 'catalog-silo'];
    assert.deepEqual(await ids(), custom);
    assert.equal(await filter('All').getAttribute('aria-description'), '6 apps');
    assert.equal(await filter('Video').getAttribute('aria-description'), '3 apps');
    await card('steam').focus();
    await sort.selectOption('name');
    assert.deepEqual(await writes(), ['steam']);
    await page.waitForTimeout(400);
    assert.deepEqual(await writes(), ['steam']);
    assert.deepEqual(await ids(), ['alpha', 'netflix', 'catalog-silo', 'steam', youtube, 'zulu']);
    await sort.selectOption('category');
    assert.deepEqual(await ids(), ['steam', 'alpha', 'zulu', 'netflix', 'catalog-silo', youtube]);
    await filter('Video').click();
    assert.deepEqual(await ids(), ['netflix', 'catalog-silo', youtube]);
    await search.fill('silo');
    assert.deepEqual(await ids(), ['catalog-silo']);
    assert.equal(await filter('Video').getAttribute('aria-description'), '1 app');
    assert.equal(await page.locator('.section-count').innerText(), '1 app of 6');
    await search.fill('missing application');
    await page.getByRole('heading', { name: 'No apps found' }).waitFor();
    assert.equal(await page.locator('.section-count').innerText(), '0 apps of 6');
    await filter('Video').focus();
    await page.keyboard.press('F8');
    assert.equal(await search.inputValue(), '');
    assert.equal(await filter('All').getAttribute('aria-pressed'), 'true');
    assert.equal((await ids()).length, 6);
    assert.equal(await page.locator('.app-card:focus').count(), 1);
    if (!installed) {
      await search.fill('vacuumtube');
      assert.deepEqual(await ids(), [youtube]);
    }
    await filter('Favorites').click();
    await filter('Home').click();
    await card('library').click();
    assert.equal(await search.inputValue(), '');
    assert.equal(await filter('All').getAttribute('aria-pressed'), 'true');
    await sort.selectOption('custom');
    assert.deepEqual(await ids(), custom);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
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
      console.log('PASS: selection writes and restoration, mapped Library, catalog counts, search and sorting.');
    } finally {
      await browser.close();
    }
  } finally {
    await server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
