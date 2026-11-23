// Use an English-language QA profile with resumable series and an external subtitle.
// This test plays an episode and changes the test profile's track selection.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

(async () => {
  const url = new URL(process.env.SILO_QA_URL);
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      storageState: process.env.SILO_QA_STORAGE_STATE,
    });
    const page = await context.newPage();
    page.setDefaultTimeout(9000);
    if (process.env.SILO_QA_TRACE)
      page.on('console', (m) => {
        if (m.text().startsWith('Silo key')) console.log(m.text());
      });
    if (process.env.SILO_QA_TRACE)
      await page.addInitScript(() =>
        addEventListener(
          'keydown',
          (e) =>
            console.log(
              'Silo key',
              e.key,
              location.pathname,
              document.activeElement?.ariaLabel ||
                document.activeElement?.textContent.trim().slice(0, 35),
            ),
          true,
        ),
      );
    const nav = require('node:fs').readFileSync(
      require.resolve('../src-tauri/src/silo/navigation.js'),
      'utf8',
    );
    await page.addInitScript({
      content: `if (window === top && location.origin === ${JSON.stringify(url.origin)}) { ${nav} }`,
    });
    await page.goto(url.href);
    const row = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'Continue Watching', exact: true }) })
      .last();
    await row.locator('.embla__slide a').first().waitFor();
    async function reach(key, predicate, max = 14) {
      for (let i = 0; i <= max; i++) {
        if (await predicate()) return;
        if (i < max) await page.keyboard.press(key);
      }
      throw Error(
        `Could not reach the requested control with ${key}: ${await page.locator(':focus').getAttribute('aria-label')}`,
      );
    }
    await reach('ArrowDown', async () => (await row.locator('a:focus').count()) > 0);
    // Exercise a card beyond the first visible page when the test library has enough series.
    const posters = await row.locator('.embla__slide').count();
    for (let i = 0; i < Math.min(3, posters - 1); i++) await page.keyboard.press('ArrowRight');
    const card = row.locator('a:focus');
    const href = await card.getAttribute('href');
    const selectedName = await card.innerText();
    const inViewport = (el) => {
      const a = el.getBoundingClientRect(),
        b = el.closest('.embla__viewport').getBoundingClientRect();
      return a.right <= b.right + 2 && a.left >= b.left - 2 && a.bottom <= innerHeight + 2 && a.top >= -2;
    };
    assert(await card.evaluate(inViewport), 'Selected poster is clipped');
    await page.keyboard.press('Enter');
    await page.waitForURL((u) => u.pathname.startsWith('/item/'));
    await page.waitForFunction(() => /^Resume/.test(document.activeElement?.textContent.trim()));
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => {
      const video = document.querySelector('video');
      return (
        video && !video.paused && video.currentTime > 5 && document.activeElement.matches('.hud-play-btn')
      );
    });
    const resumed = await page
      .locator('video')
      .first()
      .evaluate((v) => v.currentTime);
    const subtitleTrigger = page.locator('button[aria-label^="Subtitles,"]:focus');
    await reach('ArrowRight', async () => (await subtitleTrigger.count()) > 0);
    // Audio and subtitles must each be reachable with the transport row.
    await page.keyboard.press('ArrowLeft');
    await reach(
      'ArrowLeft',
      async () => (await page.locator('button[aria-label^="Audio tracks"]:focus').count()) > 0,
      4,
    );
    const audioBefore = await page.locator(':focus').getAttribute('aria-label');
    await page.keyboard.press('Enter');
    const audioMenu = page.getByRole('menu').first();
    await audioMenu.waitFor();
    const activeTrack = await page.locator(':focus').innerText();
    await page.keyboard.press('ArrowDown');
    if ((await page.locator(':focus').innerText()) === activeTrack) await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');
    await audioMenu.waitFor({ state: 'hidden' });
    await page.waitForFunction(
      (prev) =>
        [...document.querySelectorAll('button[aria-label^="Audio tracks"]')].some(
          (b) => b.ariaLabel !== prev,
        ),
      audioBefore,
    );
    const audioAfter = await page
      .locator('button[aria-label^="Audio tracks"]:visible')
      .first()
      .getAttribute('aria-label');
    await reach('ArrowRight', async () => (await subtitleTrigger.count()) > 0);
    const before = await subtitleTrigger.getAttribute('aria-label');
    await page.keyboard.press('Enter');
    const menu = page.locator('.player-menu-surface');
    await menu.waitFor();
    await page.keyboard.press(before.endsWith('Off') ? 'ArrowDown' : 'ArrowUp');
    await page.keyboard.press('Enter');
    await menu.waitFor({ state: 'hidden' });
    await page.waitForFunction(
      (prev) => document.querySelector('button[aria-label^="Subtitles,"]')?.ariaLabel !== prev,
      before,
    );
    const after = await subtitleTrigger.getAttribute('aria-label');
    await page.keyboard.press('Escape');
    await page.waitForURL((u) => u.pathname.startsWith('/item/'));
    await page.keyboard.press('Escape');
    try {
      await row.locator('a:focus').waitFor({ timeout: 4500 });
    } catch (error) {
      console.log(
        'Return state',
        await page.evaluate(() => [
          location.href,
          history.state?.idx,
          document.activeElement.outerHTML.slice(0, 260),
          [...document.querySelectorAll('section:has(a:focus) h2')].map((h) => h.textContent),
        ]),
      );
      throw error;
    }
    assert.equal(await card.getAttribute('href'), href);
    await page
      .waitForFunction(
        (el) => {
          const rect = el.getBoundingClientRect(),
            viewport = el.closest('.embla__viewport').getBoundingClientRect();
          return (
            rect.left >= viewport.left - 2 &&
            rect.right <= viewport.right + 2 &&
            rect.top >= -2 &&
            rect.bottom <= innerHeight + 2
          );
        },
        await card.elementHandle(),
        { timeout: 2000 },
      )
      .catch(async (error) => {
        console.error(
          await card.evaluate((el) => [
            el.getBoundingClientRect().toJSON(),
            el.closest('.embla__viewport').getBoundingClientRect().toJSON(),
            el.closest('.embla__container').style.transform,
            el.closest('.embla__viewport').scrollLeft,
          ]),
        );
        throw error;
      });
    console.log({
      series: selectedName,
      resumedAtSeconds: resumed,
      audioBefore,
      audioAfter,
      subtitleBefore: before,
      subtitleAfter: after,
      restored: true,
    });
    await context.close();
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
