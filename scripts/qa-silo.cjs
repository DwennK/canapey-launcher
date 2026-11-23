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

async function launcher(browser, url, width, height) {
  const context = await browser.newContext({ viewport: { width, height } });
  try {
    await context.addInitScript(() => {
      let id = 0;
      const callbacks = new Map(),
        events = new Map();
      window.qa = {
        calls: [],
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
              config: (await import('/src/lib/types.ts')).defaults(),
              native: true,
              sessions: [],
              controller: null,
            };
          if (cmd === 'plugin:event|listen') {
            events.set(args.event, args.handler);
            return args.handler;
          }
          if (cmd === 'open_silo') {
            window.qa.calls.push(args.server);
            return;
          }
          if (cmd === 'save_config') return args.config;
          if (cmd === 'audio_state') return { outputs: [], defaultId: null, volume: null, muted: false };
          if (cmd === 'check_update') return { state: 'disabled' };
          return null;
        },
      };
    });
    const page = await context.newPage();
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
      ])
        await launcher(browser, server.resolvedUrls.local[0], w, h);
      console.log(
        'PASS: Silo geometry, scroll, restoration, keyboard, modal, repeat, origin and launcher lifecycle fixtures.',
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
