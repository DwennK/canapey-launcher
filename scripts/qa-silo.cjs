// Run with Playwright available on NODE_PATH and system Chrome installed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
const script = fs.readFileSync(require.resolve('../src-tauri/src/silo/navigation.js'), 'utf8');

async function navigation(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript({
      content: `if (window === top && location.origin === 'http://silo.test') {${script}}`,
    });
    await page.route('http://silo.test/**', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: `
      <style>body{margin:0}header{height:150px}h2{margin:0}section{margin-bottom:200px}
      .embla__viewport{width:750px;overflow:hidden}.embla__container{display:flex;gap:10px;padding:4px;margin:0}
      .embla__slide{list-style:none;flex:0 0 180px;height:180px}.embla__slide a{display:block;height:100%}</style>
      <main></main><script>
      let idx=0; const main=document.querySelector('main');
      function row(n){return '<section><h2>Row '+n+'</h2><div class="embla__viewport"><ul class="embla__container">'+Array.from({length:9},(_,i)=>
        '<li class="embla__slide"><a href="/item/'+n+'-'+i+'">Poster '+n+'-'+i+'</a></li>').join('')+'</ul></div></section>'}
      function render(){main.innerHTML=location.pathname==='/' ? '<header><button>Search</button></header>'+row(0)+row(1)+row(2)
        : '<button id="dialog">Tracks</button><input aria-label="Search" value="abc"><dialog><button>Audio</button><button>Subtitles</button></dialog>'}
      document.addEventListener('click',e=>{if(e.target.matches('a')){e.preventDefault();history.pushState({idx:++idx},'',e.target.href);render()}
        if(e.target.id==='dialog')document.querySelector('dialog').showModal()});
      onpopstate=render;history.replaceState({idx:0},'','/');render()</script>`,
      }),
    );
    await page.goto('http://silo.test');
    const focused = () => page.locator(':focus').innerText();
    const key = (name) => page.keyboard.press(name);
    await page.waitForFunction(() => document.activeElement?.textContent === 'Search');
    await key('ArrowDown');
    assert.equal(await focused(), 'Poster 0-0');
    for (let i = 0; i < 6; i++) await key('ArrowRight');
    assert.equal(await focused(), 'Poster 0-6');
    const snapshot = () =>
      page.evaluate(() => {
        const rect = document.activeElement.getBoundingClientRect(),
          view = document.activeElement.closest('.embla__viewport');
        return {
          scroll: view.scrollLeft,
          y: scrollY,
          x: rect.x,
          visible:
            rect.left >= view.getBoundingClientRect().left &&
            rect.right <= view.getBoundingClientRect().right + 1,
        };
      });
    const first = await snapshot();
    assert(first.visible && first.scroll > 0);
    await key('ArrowDown');
    assert((await focused()).startsWith('Poster 1-'));
    assert(Math.abs((await snapshot()).x - first.x) < 190);
    await key('ArrowDown');
    const selected = await focused(),
      position = await snapshot();
    assert(selected.startsWith('Poster 2-') && position.y > 0);
    await key('Enter');
    await page.waitForFunction(() => document.activeElement?.id === 'dialog');
    await page.keyboard.down('Enter');
    await page.keyboard.down('Enter');
    await page.keyboard.up('Enter');
    await page.locator('dialog[open]').waitFor();
    await key('ArrowRight');
    assert.equal(await focused(), 'Subtitles');
    await key('Escape');
    await page.locator('dialog').waitFor({ state: 'hidden' });
    assert.equal(await focused(), 'Tracks');
    await key('ArrowRight');
    assert.equal(await page.locator(':focus').getAttribute('aria-label'), 'Search');
    await page.keyboard.press('End');
    await key('ArrowLeft');
    await page.keyboard.type('!');
    assert.equal(await page.locator('input').inputValue(), 'ab!c');
    await key('Enter');
    await page.locator('#canapey-silo-keys').waitFor();
    await key('Enter');
    await key('Escape');
    assert.equal(await page.locator('input').inputValue(), 'ab!1c');
    await key('Escape');
    await page.waitForFunction((text) => document.activeElement.textContent === text, selected);
    assert.deepEqual(await snapshot(), position);
    // The native global-shortcut adapter sends this exact pair to Chromium.
    const cdp = await context.newCDPSession(page);
    for (let i = 0; i < 2; i++)
      for (const type of ['keyDown', 'keyUp']) {
        await cdp.send('Input.dispatchKeyEvent', {
          type,
          key: 'ArrowRight',
          code: 'ArrowRight',
          windowsVirtualKeyCode: 39,
          text: '',
        });
      }
    assert.equal(await focused(), 'Poster 2-' + Math.min(8, Number(selected.at(-1)) + 2));
    await page.keyboard.down('ArrowLeft');
    await page.keyboard.down('ArrowLeft');
    await page.keyboard.up('ArrowLeft');
    assert.equal(await focused(), 'Poster 2-' + (Math.min(8, Number(selected.at(-1)) + 2) - 2));
    await page.route('http://other.test/**', (r) =>
      r.fulfill({ contentType: 'text/html', body: '<button>Elsewhere</button>' }),
    );
    await page.goto('http://other.test');
    await key('ArrowDown');
    assert.equal(await page.locator(':focus').count(), 0);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
}

async function playback(browser, width, height) {
  const context = await browser.newContext({ viewport: { width, height } });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript({ content: script });
    const clip = fs.readFileSync(require.resolve('./fixtures/seek-test.webm')).toString('base64');
    const html = fs.readFileSync(require.resolve('./fixtures/silo-player.html'), 'utf8');
    await page.route('http://silo.test/watch/test', route => route.fulfill({
      body: html.replace('/seek-test.webm', 'data:video/webm;base64,' + clip), contentType: 'text/html',
    }));
    page.setDefaultTimeout(5000);
    await page.goto('http://silo.test/watch/test');
    await page.waitForFunction(() => document.querySelector('video').readyState >= 3);
    await page.locator('.hud-play-btn:focus').waitFor();
    const key = name => page.keyboard.press(name);
    const cdp = await context.newCDPSession(page);
    async function media(name, vk) {
      for (const type of ['keyDown', 'keyUp']) {
        await cdp.send('Input.dispatchKeyEvent', {
          type, key: name, code: name, windowsVirtualKeyCode: vk, text: '',
        });
      }
    }
    const at = seconds => page.waitForFunction(
      t => Math.abs(document.querySelector('video').currentTime - t) < 0.1, seconds,
      { timeout: 2000 },
    );
    await key('ArrowUp');
    await page.locator('[data-player-seek-slider]:focus').waitFor();
    await key('ArrowRight');
    await at(30);
    await key('ArrowLeft');
    await at(20);
    await key('Enter');
    await page.locator('.hud-play-btn:focus').waitFor();
    await page.locator('.player-container').evaluate(el => el.classList.add('cursor-none'));
    await key('ArrowLeft');
    await at(10);
    await key('ArrowRight');
    await at(40);
    await media('MediaTrackNext', 176);
    await at(70);
    await media('MediaTrackPrevious', 177);
    await at(60);
    await media('MediaTrackPrevious', 177);
    await at(50);
    await media('MediaPlayPause', 179);
    await page.waitForFunction(() => document.querySelector('video').currentTime > 50.2);
    await media('MediaPlayPause', 179);
    await page.waitForFunction(() => document.querySelector('video').paused);
    await key('Enter');
    await key('ArrowRight');
    await key('ArrowRight');
    await key('Enter');
    await page.locator('[data-episode=next]').waitFor();
    await key('ArrowRight');
    await key('Enter');
    await page.locator('dialog[open]').waitFor();
    await key('ArrowRight');
    assert.equal(await page.locator(':focus').innerText(), 'Subtitles');
    await key('Escape');
    await page.locator('#tracks:focus').waitFor();
    await media('MediaStop', 178);
    await page.getByText('Episode details').waitFor();
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
}

async function checkSiloOrder(page) {
  const silo = page.getByRole('button', { name: 'Silo', exact: true });
  const cards = page.locator('.app-card');
  async function remote(action, pressed = true) {
    await page.evaluate(({ action, pressed }) => qa.emit('remote-action', {
      binding: { action, button: action }, pressed,
    }), { action, pressed });
  }
  async function ok() {
    await remote('accept');
    await remote('accept', false);
  }
  const labels = () => cards.evaluateAll(els => els.map(el => el.getAttribute('aria-label')));
  const before = await labels();
  await remote('accept');
  const actions = page.getByRole('dialog', { name: 'Actions for Silo' });
  await actions.waitFor();
  await remote('accept', false);
  const move = actions.getByRole('button', { name: 'Move on Home' });
  await remote('down');
  assert(await move.evaluate(el => el === document.activeElement));
  await ok();
  const earlier = page.getByRole('button', { name: 'Move earlier' });
  await earlier.waitFor();
  for (let i = before.indexOf('Silo'); i > 0; i--) {
    await ok();
    await page.waitForFunction(index => document.querySelectorAll('.app-card')[index]?.getAttribute('aria-label') === 'Silo', i - 1);
  }
  assert(await earlier.isDisabled());
  if (process.env.SILO_QA_SHOTS) {
    await page.screenshot({ path: process.env.SILO_QA_SHOTS + '/silo-order-' + page.viewportSize().width + '.png' });
  }
  await remote('back');
  await actions.waitFor();
  await remote('back');
  await silo.and(page.locator(':focus')).waitFor();
  assert.deepEqual(await labels(), ['Silo', ...before.filter(name => name !== 'Silo')]);
  await page.reload();
  await cards.first().waitFor();
  assert.equal(await cards.first().getAttribute('aria-label'), 'Silo');

  // A first-run position also applies after adding apps and choosing favorites.
  await page.evaluate(() => {
    const config = JSON.parse(sessionStorage.getItem('saved-config'));
    config.apps = ['Video', 'Music', 'Games'].map(name => ({
      id: name, name, theme: 'home', source: 'test', card: null, background: null, icon: null,
      target: { kind: 'uri', value: 'https://example.com/' + name, args: [], workingDir: null },
    }));
    config.settings.library.favorites = ['Music', 'Games'];
    config.settings.library.sort = 'name';
    sessionStorage.setItem('saved-config', JSON.stringify(config));
  });
  await page.reload();
  await cards.first().and(silo).waitFor();
  await silo.click({button:'right'});
  await move.click();
  await page.getByRole('button', { name: 'Move later' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.app-card')[1]?.getAttribute('aria-label') === 'Silo');
  await page.reload();
  await cards.nth(1).and(silo).waitFor();
  assert.equal(await cards.first().getAttribute('aria-label'), 'Music');
  assert.equal(await cards.last().getAttribute('aria-label'), 'All apps');
  assert.equal(await page.evaluate(() => JSON.parse(sessionStorage.getItem('saved-config')).settings.library.sort), 'name');
}

async function launcher(browser, url, width, height) {
  const context = await browser.newContext({ viewport: { width, height } });
  try {
    await context.addInitScript(() => {
      let id = 0;
      const callbacks = new Map(),
        events = new Map();
      window.qa = {
        calls: [],
        cards: [],
        resumed: [],
        emit(name, value) {
          callbacks.get(events.get(name))?.({ payload: value });
        },
      };
      window.isTauri = true;
      window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
      window.__TAURI_INTERNALS__ = {
        transformCallback: (fn) => {
          callbacks.set(++id, fn);
          return id;
        },
        unregisterCallback: (n) => callbacks.delete(n),
        convertFileSrc: (p) => p,
        invoke: async (cmd, args = {}) => {
          if (cmd === 'bootstrap')
            return {
              config: JSON.parse(sessionStorage.getItem('saved-config')) ?? (await import('/src/lib/types.ts')).defaults(),
              native: true,
              sessions: [],
              controller: null,
            };
          if (cmd === 'plugin:event|listen') {
            events.set(args.event, args.handler);
            return args.handler;
          }
          if (cmd === 'silo_continue_watching') return window.qa.cards;
          if (cmd === 'open_silo') {
            if (args.contentId) window.qa.resumed.push(args.contentId);
            window.qa.calls.push(args.server);
            return;
          }
          if (cmd === 'save_config') {
            sessionStorage.setItem('saved-config', JSON.stringify(args.config));
            return args.config;
          }
          if (cmd === 'remote_home_status') return {
            available: true,
            active: JSON.parse(sessionStorage.getItem('saved-config'))?.settings.remoteBindings ?? [],
          };
          if (cmd === 'list_monitors') return [];
          if (cmd === 'audio_state') return { outputs: [], defaultId: null, volume: null, muted: false };
          if (cmd === 'check_update') return { state: 'disabled' };
          return null;
        },
      };
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.setDefaultTimeout(8000);
    await page.goto(url);
    await page.locator('.app-card:focus').waitFor();
    const silo = page.getByRole('button', { name: 'Silo', exact: true });
    // Carousel navigation through the normal card entry point, including first-run setup.
    for (let i = 0; i < 15 && !(await silo.evaluate((el) => el === document.activeElement)); i++)
      await page.keyboard.press('ArrowRight');
    assert(await silo.evaluate((el) => el === document.activeElement));
    await page.keyboard.press('Enter');
    const input = page.getByLabel('Silo server address');
    await input.waitFor();
    await page.waitForFunction(() => document.activeElement.id === 'silo-server');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.waitForFunction(() => !document.querySelector('.panel-enter-active'));
    if (process.env.SILO_QA_SHOTS)
      await page.screenshot({ path: process.env.SILO_QA_SHOTS + '/setup-' + width + '.png' });
    await page.keyboard.type('http://silo.test:8090');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => qa.calls.length === 1);
    await page.evaluate(() => qa.emit('home', false));
    await page.waitForFunction(() => document.activeElement.getAttribute('aria-label') === 'Silo');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => qa.calls.length === 2);
    assert.deepEqual(await page.evaluate(() => qa.calls), [
      'http://silo.test:8090/',
      'http://silo.test:8090/',
    ]);
    await page.evaluate(() => qa.emit('silo-unavailable'));
    await page.getByRole('button', { name: 'Retry', exact: true }).waitFor();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await input.waitFor();
    assert.equal(await input.inputValue(), 'http://silo.test:8090/');
    await page.keyboard.press('Escape');
    await page.reload();
    await page.locator('.app-card:focus').waitFor();
    for (let i = 0; i < 15 && !(await silo.evaluate((el) => el === document.activeElement)); i++)
      await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => qa.calls[0] === 'http://silo.test:8090/');
    const episodes = page.locator('.silo-row button');
    assert.equal(await episodes.count(), 0);
    await page.evaluate(() => {
      qa.cards = Array.from({ length: 6 }, (_, i) => ({
        id: 'episode-' + i, title: 'Episode ' + i, series: 'Series ' + i,
        season: 1, episode: i + 1, percent: 30 + i, image: '',
      }));
      qa.emit('home', false);
    });
    await episodes.first().waitFor();
    assert.equal(await episodes.count(), 5);
    await page.keyboard.press('ArrowDown');
    await page.waitForFunction(() => document.activeElement.matches('.silo-episode'));
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowRight');
    const picked = page.locator('.silo-episode:focus');
    const contentId = (await picked.getAttribute('data-focus-key')).slice(5);
    assert.match(await picked.getAttribute('aria-label'), /S01E0[1-5].*% watched/);
    assert.equal(await picked.locator('.silo-progress i').evaluate(el => el.style.width),
      (30 + Number(contentId.split('-')[1])) + '%');
    await page.keyboard.press('Enter');
    assert.deepEqual(await page.evaluate(() => qa.resumed), [contentId]);
    await page.keyboard.press('ArrowUp');
    await page.locator('.cards .app-card:focus:not(.silo-episode)').waitFor();
    await page.evaluate(() => { qa.cards = []; qa.emit('home', false); });
    await episodes.first().waitFor({ state: 'detached' });
    await checkSiloOrder(page);
    // Change a working server directly from Home, cancel a draft, then apply from Library.
    const editAddress = page.getByRole('button', { name: 'Change server address' });
    await silo.focus();
    await page.keyboard.down('Enter');
    await editAddress.waitFor();
    await page.keyboard.up('Enter');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    assert(await editAddress.evaluate(el => el === document.activeElement));
    await page.keyboard.press('Enter');
    await input.waitFor();
    assert.equal(await input.inputValue(), 'http://silo.test:8090/');
    await input.fill('http://discarded.test');
    await page.getByRole('button', { name: 'Return to Canapey' }).click();
    await page.getByRole('button', { name: 'Library', exact: true }).click();
    await silo.click({ button: 'right' });
    await editAddress.click();
    assert.equal(await input.inputValue(), 'http://silo.test:8090/');
    await input.fill('invalid');
    await input.press('Enter');
    await page.getByText('Enter a valid HTTP or HTTPS server address.').waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem('canapey-silo-server')), 'http://silo.test:8090/');
    await input.fill('https://silo-new.test');
    await input.press('Enter');
    await page.waitForFunction(() => qa.calls.at(-1) === 'https://silo-new.test/');
    await page.reload();
    await silo.click();
    await page.waitForFunction(() => qa.calls[0] === 'https://silo-new.test/');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'Remote', exact: true }).click();
    const picker = page.getByRole('combobox', { name: 'Button', exact: true });
    for (const [button, key, action] of [
      ['previous', 'F6', 'previousTrack'], ['next', 'F7', 'nextTrack'],
      ['play', 'F8', 'playPause'], ['right', 'F9', 'right'],
    ]) {
      await picker.selectOption(button);
      await page.getByText('Listening…', { exact: true }).waitFor();
      await page.keyboard.press(key);
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await page.waitForFunction(({key, action}) =>
        JSON.parse(sessionStorage.getItem('saved-config'))?.settings.remoteBindings.some(
          b => b.global && b.action === action && b.key.code === key,
        ), {key, action});
      // The editor waits for a learned key's release before resuming capture.
      await page.waitForTimeout(510);
    }
    await page.reload();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'Remote', exact: true }).click();
    await picker.selectOption('next');
    await page.getByText('Next track · Global active', { exact: true }).waitFor();
    assert.equal(await page.locator('.remote-signal kbd').innerText(), 'F7');
    assert.deepEqual(errors, []);
    if (process.env.SILO_QA_SHOTS) {
      await page.locator('.remote-scope-note').first().scrollIntoViewIfNeeded();
      await page.screenshot({ path: process.env.SILO_QA_SHOTS + '/remote-' + width + '.png' });
    }
  } finally {
    await context.close();
  }
}

(async () => {
  const server = await (
    await import('vite')
  ).createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
  try {
    await server.listen();
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    try {
      await navigation(browser);
      for (const [w, h] of [
        [1440, 900],
        [390, 844],
      ]) {
        await playback(browser, w, h);
        await launcher(browser, server.resolvedUrls.local[0], w, h);
      }
      console.log(
        'PASS: Episode seeking, playback, media shortcuts, track menus, Silo geometry, scroll, restoration, keyboard, modal, repeat, origin and launcher lifecycle fixtures.',
      );
    } finally {
      await browser.close();
    }
  } finally {
    await server.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
