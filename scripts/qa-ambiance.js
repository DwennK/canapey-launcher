// Run in an isolated Chrome session using the Playwright CLI.
async (page) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    window.__soundGains = [];
    const createGain = AudioContext.prototype.createGain;
    AudioContext.prototype.createGain = function () {
      const node = createGain.call(this);
      const set = node.gain.setValueAtTime.bind(node.gain);
      node.gain.setValueAtTime = (value, time) => { window.__soundGains.push(value); return set(value, time); };
      return node;
    };
  });
  await page.evaluate(() => localStorage.removeItem('canapey-ui-preview-v1'));
  await page.reload();
  await page.locator('main.ready').waitFor();
  const button = name => page.getByRole('button', { name, exact: true });
  const slider = name => page.getByRole('slider', { name: new RegExp(name) });
  const setRange = async (name, value) => {
    await slider(name).evaluate((el, value) => {
      el.value = String(value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, value);
  };
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => document.querySelector('.backdrop-current').getAttribute('src') === '/art/netflix.webp');
  await page.keyboard.press('F1');
  await button('Manettes').click();
  assert(await page.getByRole('combobox', { name: /Retour global/ }).isVisible(), 'Controller settings missing');
  assert(await page.getByRole('switch', { name: /Animations|Sons de navigation/ }).count() === 0, 'Ambiance settings still in controller menu');
  await button('Ambiance').click();
  const dynamic = page.getByRole('switch', { name: /Fond lié/ });
  await dynamic.uncheck();
  await page.waitForFunction(() => document.querySelector('.backdrop-current').getAttribute('src') === '/art/home.webp');
  await dynamic.check();
  await page.waitForFunction(() => document.querySelector('.backdrop-current').getAttribute('src') === '/art/netflix.webp');
  await dynamic.uncheck();
  await setRange('Luminosité', 0.65);
  await setRange('Flou', 6);
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.backdrop-current')).filter === 'brightness(0.65) blur(6px)');
  assert(await page.locator('.ambiance-preview img').evaluate(el => getComputedStyle(el).filter === 'brightness(0.65) blur(6px)'), 'Preview differs from actual background');
  await page.getByRole('switch', { name: /Animations/ }).uncheck();
  assert(await page.locator('main.reduce-motion').count() === 1, 'Animations not disabled');
  await setRange('Volume des sons', 0.25);
  await button('Écouter un son').click();
  assert(await page.evaluate(() => window.__soundGains.at(-1) === 0.009), 'Sound volume not applied');
  await page.getByRole('switch', { name: 'Sons de navigation', exact: true }).uncheck();
  assert(await slider('Volume des sons').isDisabled() && await button('Écouter un son').isDisabled(), 'Muted controls should be disabled');
  await page.getByRole('switch', { name: 'Sons de navigation', exact: true }).check();
  // Directional editing follows the same route as controller and remote actions.
  await slider('Flou').focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  assert(await slider('Flou').inputValue() === '7', 'Directional slider editing failed');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('canapey-ui-preview-v1')).settings.backgroundBlur === 7);
  await page.reload();
  await page.locator('main.ready').waitFor();
  await page.keyboard.press('F1');
  await button('Ambiance').click();
  assert(await slider('Luminosité').inputValue() === '0.65' && await slider('Flou').inputValue() === '7', 'Visual preferences not persisted');
  assert(await slider('Volume des sons').inputValue() === '0.25' && !await dynamic.isChecked(), 'Sound/background preferences not persisted');
  for (const viewport of [{width:1440,height:900}, {width:390,height:844}]) {
    await page.setViewportSize(viewport);
    await button('Ambiance').click();
    await page.locator('.settings-content').evaluate(el => { el.scrollTop = 0; });
    await page.screenshot({ path: `output/playwright/ambiance-${viewport.width}.png`, animations: 'disabled' });
    await button('Écouter un son').scrollIntoViewIfNeeded();
    const bounds = await button('Écouter un son').boundingBox();
    assert(bounds && bounds.y >= 0 && bounds.y + bounds.height <= viewport.height, 'Last setting inaccessible');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Horizontal overflow');
    await button('Manettes').click();
    await page.getByRole('combobox', { name: /Retour global/ }).waitFor();
  }
  assert(errors.length === 0, errors.join('\n'));
  return { result: 'passed', viewports: ['1440×900', '390×844'], errors };
}
