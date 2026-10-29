// Run with playwright-cli run-code in an isolated preview session.
async (page) => {
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  await page.setViewportSize({ width: 1440, height: 900 });
  // The preview bridge accepts /art/ paths, so serve a 64px shell-icon fixture
  // there to exercise the same AppCard props as an imported Windows app.
  const native = '/art/qa-native-icon.svg';
  await page.unroute('**/brands/netflix.svg');
  await page.unroute(`**${native}`);
  await page.route(`**${native}`, route => route.fulfill({
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="12" fill="#8da5bb"/><path d="M16 16h32v32H16z" fill="#fff"/></svg>',
  }));
  await page.evaluate(async native => {
    const { defaults } = await import('/src/lib/types.ts');
    const config = defaults();
    config.settings.motion = false;
    config.settings.sound = false;
    config.apps = ['netflix', 'youtube', 'spotify', 'steam', 'plezy', 'silo', 'unknown'].map(theme => ({
      id: theme,
      name: theme === 'youtube' ? 'Living room videos' : theme[0].toUpperCase() + theme.slice(1),
      theme: theme === 'unknown' ? 'netflix' : theme,
      target: { kind: 'executable', value: `C:/Apps/${theme === 'youtube' ? 'VacuumTube' : theme}.exe`, args: [], workingDir: null },
      card: null, background: null, icon: native, source: 'QA',
    }));
    config.selectedId = 'netflix';
    localStorage.setItem('canapey-ui-preview-v1', JSON.stringify(config));
  }, native);
  await page.reload();
  await page.locator('main.ready').waitFor();
  const card = id => page.locator(`.cards [data-focus-key="app:${id}"]`);
  const verifyLogo = async (locator, src, isNative = false) => {
    await locator.locator('.card-logo img').waitFor();
    await page.waitForFunction(({ selector, src, isNative }) => {
      const image = document.querySelector(selector);
      return image?.getAttribute('src') === src && image.complete && image.naturalWidth > 0 && image.classList.contains('native-app-icon') === isNative;
    }, { selector: await locator.evaluate(el => el.closest('.edit-preview') ? '.edit-preview .card-logo img' : `.cards [data-focus-key="${el.dataset.focusKey}"] .card-logo img`), src, isNative });
  };
  await verifyLogo(card('netflix'), '/brands/netflix.svg');
  await page.screenshot({ path: 'output/playwright/app-logos-home.png' });
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  for (const id of ['netflix', 'youtube', 'spotify', 'steam', 'plezy', 'silo']) {
    await verifyLogo(card(id), `/brands/${id}.${id === 'spotify' ? 'png' : 'svg'}`);
  }
  await verifyLogo(card('unknown'), native, true);
  await page.screenshot({ path: 'output/playwright/app-logos-desktop.png' });
  await card('spotify').click({ button: 'right' });
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Living room music');
  await page.getByRole('combobox', { name: 'Ambience', exact: true }).selectOption('netflix');
  await verifyLogo(page.locator('.edit-preview .app-card'), '/brands/spotify.png');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await verifyLogo(card('spotify'), '/brands/spotify.png');
  await page.setViewportSize({ width: 390, height: 844 });
  await card('spotify').scrollIntoViewIfNeeded();
  await verifyLogo(card('spotify'), '/brands/spotify.png');
  const bounds = await card('spotify').boundingBox();
  assert(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 390, 'Mobile card is clipped');
  await page.screenshot({ path: 'output/playwright/app-logos-mobile.png' });
  // A missing bundled logo must recover to the native icon, then to text.
  await page.route('**/brands/netflix.svg', route => route.abort());
  await page.reload();
  await page.locator('main.ready').waitFor();
  await verifyLogo(card('netflix'), native, true);
  await page.route(`**${native}`, route => route.abort());
  await page.reload();
  await page.locator('main.ready').waitFor();
  await card('netflix').locator('.card-wordmark').waitFor();
  assert(await card('netflix').locator('.card-wordmark').textContent() === 'Netflix', 'Missing text fallback');
  assert(errors.length === 0, errors.join('\n'));
  return { passed: true, brands: 6, renamedApp: true, independentAmbience: true, nativeAndTextFallback: true, errors };
}
