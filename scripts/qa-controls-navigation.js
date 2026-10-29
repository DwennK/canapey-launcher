// Playwright CLI run-code. Uses the browser preview, not a native receiver.
async (page) => {
  const errors = [];
  const onError = error => errors.push(error.message);
  page.on('pageerror', onError);
  const verify = (condition, message) => { if (!condition) throw new Error(message); };
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('http://127.0.0.1:1420');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('navigation', { name: 'Settings categories' }).getByRole('button', { name: 'Controls', exact: true }).click();
    const tabs = page.getByRole('group', { name: 'Controls', exact: true });
    verify(JSON.stringify(await tabs.getByRole('button').allTextContents()) === JSON.stringify(['Controllers', 'Remote', 'iPhone']), 'Controls must have exactly three direct entries.');
    await page.getByRole('heading', { name: 'Controller and navigation' }).waitFor();
    await tabs.getByRole('button', { name: 'Remote', exact: true }).click();
    await page.getByRole('heading', { name: 'Skip 1s / Flirc' }).waitFor();
    verify(await page.getByRole('group', { name: 'Remote type' }).count() === 0, 'Nested remote selector should be removed.');
    await page.screenshot({ path: 'output/playwright/controls-remote-desktop.png' });
    await tabs.getByRole('button', { name: 'iPhone', exact: true }).click();
    await page.locator('#apple-remote-title').waitFor();
    verify(await tabs.getByRole('button', { name: 'iPhone' }).getAttribute('aria-pressed') === 'true', 'iPhone must be selected.');
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('canapey-ui-preview-v1')).settings.lastSettingsTab === 'iphone');
    await page.screenshot({ path: 'output/playwright/controls-iphone-desktop.png' });
    await page.reload();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.locator('#apple-remote-title').waitFor();
    verify(await page.getByRole('navigation', { name: 'Settings categories' }).getByRole('button', { name: 'Controls', exact: true }).getAttribute('aria-current') === 'page', 'Restored iPhone page must keep Controls active.');
    await page.setViewportSize({ width: 390, height: 844 });
    for (const name of ['Controllers', 'Remote', 'iPhone']) {
      await tabs.getByRole('button', { name, exact: true }).click();
      await page.screenshot({ path: `output/playwright/controls-${name.toLowerCase()}-mobile.png` });
      verify(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${name} overflows on mobile.`);
      verify(await tabs.evaluate(element => element.scrollWidth <= element.clientWidth), `${name} tabs overflow on mobile.`);
    }
    verify(errors.length === 0, errors.join('\n'));
    return { passed: true, viewports: ['1440x900', '390x844'], checks: ['direct tabs', 'remote content', 'iPhone content', 'saved tab restored', 'selected category', 'mobile overflow', 'page errors'] };
  } finally {
    page.off('pageerror', onError);
  }
}
