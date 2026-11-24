// Run with Playwright on NODE_PATH and system Chrome installed.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

async function verifyKeyboard(page) {
  await page.getByRole('button', { name: 'Search keyboard' }).click();
  const field = page.locator('.keyboard-panel textarea');
  const left = page.getByRole('button', { name: 'Cursor left' });
  const right = page.getByRole('button', { name: 'Cursor right' });
  const range = () => field.evaluate(el => [el.selectionStart, el.selectionEnd]);
  await field.fill('ABCDE');
  for (const [arrow, expected] of [[left, 1], [right, 3]]) {
    await field.focus();
    await field.evaluate(el => el.setSelectionRange(1, 1));
    await field.press('Shift+ArrowRight');
    await field.press('Shift+ArrowRight');
    assert.deepEqual(await range(), [1, 3]);
    await arrow.click();
    assert.deepEqual(await range(), [expected, expected]);
  }
  await field.fill('💙');
  await left.click();
  assert.deepEqual(await range(), [0, 0]);
  await left.click();
  assert.deepEqual(await range(), [0, 0]);
  await right.click();
  assert.deepEqual(await range(), [2, 2]);
  await right.click();
  assert.deepEqual(await range(), [2, 2]);
  await page.locator('.keyboard-panel').getByRole('button', { name: 'Cancel', exact: true }).click();
}

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
            remoteBindings: [
              { button: 'library', action: 'library', key: { code: 'F8', ctrl: false, alt: false, shift: false }, global: false, appId: null },
              { button: 'red', action: 'launch', key: { code: 'F9', ctrl: false, alt: false, shift: false }, global: true, appId: 'removed-app' },
            ],
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
    assert.equal(await page.getByRole('searchbox').count(), 0);
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
    assert.equal(await page.locator('.section-count').innerText(), '3 apps of 6');
    await card('netflix').focus();
    await page.keyboard.press('ArrowUp');
    assert(await filter('Video').evaluate(el => el === document.activeElement));
    await page.keyboard.press('ArrowDown');
    assert.equal(await selectedId(), 'app:netflix');
    await filter('Favorites').click();
    await page.getByRole('heading', { name: 'No apps found' }).waitFor();
    assert.equal(await page.locator('.section-count').innerText(), '0 apps of 6');
    await filter('Clear filters').click();
    assert(await filter('All').evaluate(el => el === document.activeElement));
    assert.deepEqual(await ids(), ['steam', 'alpha', 'zulu', 'netflix', 'catalog-silo', youtube]);
    await filter('Favorites').click();
    await filter('Home').click();
    await page.locator('.app-card:focus').waitFor();
    await page.keyboard.press('ArrowDown');
    assert.equal(await filter('All').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('.grid .app-card:focus').count(), 1);
    await filter('Video').click();
    await filter('Video').focus();
    await page.keyboard.press('F8');
    assert.equal(await filter('All').getAttribute('aria-pressed'), 'true');
    assert.equal((await ids()).length, 6);
    assert.equal(await page.locator('.app-card:focus').count(), 1);
    await filter('Favorites').click();
    await filter('Home').click();
    await card('library').click();
    assert.equal(await filter('All').getAttribute('aria-pressed'), 'true');
    await sort.selectOption('custom');
    assert.deepEqual(await ids(), custom);
    await filter('Add').click();
    const picker = page.getByRole('dialog', { name: 'Add apps' });
    const search = picker.getByRole('searchbox', { name: 'Search for an app' });
    await search.fill('spo');
    await page.setViewportSize({ width: viewport.width - 30, height: viewport.height - 80 });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert(await search.evaluate(el => el === document.activeElement));
    await page.keyboard.type('t');
    assert.equal(await search.inputValue(), 'spot');
    assert.equal(await picker.locator('[data-app-row]').count(), 1);
    assert.match(await picker.locator('[data-app-row]').innerText(), /Spotify/);
    await page.setViewportSize(viewport);
    await verifyKeyboard(page);
    await picker.getByRole('button', { name: 'Cancel', exact: true }).click();
    await filter('Settings').click();
    await filter('Remote').click();
    await page.getByRole('combobox', { name: 'Button', exact: true }).selectOption('red');
    const app = page.getByRole('combobox', { name: 'App', exact: true });
    assert.equal(await app.inputValue(), 'removed-app');
    const countBefore = (await writes()).length;
    await filter('Save').click();
    await page.getByRole('alert').filter({ hasText: 'Choose an app.' }).waitFor();
    assert.equal((await writes()).length, countBefore);
    await app.selectOption('steam');
    await filter('Save').click();
    await page.getByText('Mapping saved.', { exact: true }).waitFor();
    const binding = await page.evaluate(() => window.configWrites.at(-1).settings.remoteBindings.find(item => item.button === 'red'));
    assert.equal(binding.appId, 'steam');
    assert.equal(binding.key.code, 'F9');
    await page.evaluate(() => {
      const config = JSON.parse(localStorage.getItem('canapey-ui-preview-v1'));
      config.apps = [];
      localStorage.setItem('canapey-ui-preview-v1', JSON.stringify(config));
    });
    await page.reload();
    await filter('Library').click();
    await page.locator('.grid .app-card:focus').waitFor();
    await page.keyboard.press('ArrowUp');
    await page.locator('.carousel .app-card:focus').waitFor();
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
      console.log('PASS: selection writes and restoration, mapped Library, category and favorite filters, sorting, Add search and resize focus, keyboard selections and remote reassignment.');
    } finally {
      await browser.close();
    }
  } finally {
    await server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
