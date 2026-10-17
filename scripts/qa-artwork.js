// Isolated preview session: tests art loading, general ambiances and persistence.
async (page) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const assert = (ok, message) => { if (!ok) throw Error(message); };
  await page.setViewportSize({width:1440,height:900});
  await page.evaluate(async () => {
    const { defaults } = await import('/src/lib/types.ts');
    const c = defaults();
    c.settings.motion = false;
    c.settings.sound = false;
    c.apps = ['spotify','netflix','youtube','internet','plezy','steam','silo','home'].map(theme => ({
      id:theme, name:theme === 'home' ? 'Salon' : theme[0].toUpperCase() + theme.slice(1), theme,
      target:{kind:'uri',value:'https://example.com/'+theme,args:[],workingDir:null},
      card:null,background:null,icon:null,source:'QA'
    }));
    c.selectedId='spotify';
    localStorage.setItem('canapey-ui-preview-v1', JSON.stringify(c));
  });
  await page.reload();
  await page.locator('main.ready').waitFor();
  const background = async id => {
    await page.waitForFunction(id => {
      const image = document.querySelector('.backdrop-current');
      return image?.getAttribute('src') === `/art/${id}.webp` && image.complete && image.naturalWidth > 0 && !document.querySelector('.backdrop-old');
    }, id);
  };
  for (const theme of ['spotify','netflix','youtube','internet','plezy','steam','silo','home']) {
    await page.locator(`.cards .app-card.${theme}:not(.special)`).focus();
    await background(theme);
    assert(await page.locator(`.cards .app-card.${theme}:not(.special) img.card-image`).evaluate(el => el.complete && el.naturalWidth > 0), 'Missing card '+theme);
    await page.screenshot({path:`output/playwright/artwork-${theme}.png`});
  }
  await page.keyboard.press('F1');
  await page.getByRole('button',{name:'Ambiance',exact:true}).click();
  const gallery = page.getByRole('group',{name:'Ambiances générales'});
  for (const [name,id] of [['Salon','home'],['Émeraude','spotify'],['Nuit','night'],['Crépuscule','dusk']]) {
    await gallery.getByRole('button',{name,exact:true}).click();
    await background(id);
    assert(await gallery.getByRole('button',{name,exact:true}).getAttribute('aria-pressed') === 'true', 'Selection unclear '+name);
    assert(!await page.getByRole('switch',{name:/Fond lié/}).isChecked(), 'General choice should enable fixed mode');
  }
  // Keyboard/remote activation of a general ambience.
  await gallery.getByRole('button',{name:'Nuit',exact:true}).focus();
  await page.keyboard.press('Enter');
  await background('night');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('canapey-ui-preview-v1')).settings.generalAmbiance === 'night');
  await page.reload();
  await page.locator('main.ready').waitFor();
  await background('night');
  await page.locator('.cards .app-card.spotify').focus();
  await background('night');
  await page.keyboard.press('F1');
  await page.getByRole('button',{name:'Ambiance',exact:true}).click();
  assert(await gallery.getByRole('button',{name:'Nuit',exact:true}).getAttribute('aria-pressed') === 'true', 'General choice lost after reload');
  await page.getByRole('switch',{name:/Fond lié/}).check();
  await background('spotify');
  await page.keyboard.press('Escape');
  await page.locator('.cards .app-card.home:not(.special)').focus();
  await background('night');
  await page.locator('.cards .app-card.silo').focus();
  await background('silo');
  for (const viewport of [{width:1440,height:900}, {width:390,height:844}]) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    await page.screenshot({path:`output/playwright/artwork-silo-${viewport.width}.png`});
    await page.keyboard.press('F1');
    await page.getByRole('button',{name:'Ambiance',exact:true}).click();
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.overlay')).opacity === '1');
    await page.locator('.settings-content').evaluate(el => {el.scrollTop=0;});
    for (const name of ['Salon','Émeraude','Nuit','Crépuscule']) {
      const r=await gallery.getByRole('button',{name,exact:true}).boundingBox();
      assert(r && r.x>=0 && r.x+r.width <= viewport.width, 'Choice clipped '+name);
    }
    await page.screenshot({path:`output/playwright/artwork-picker-${viewport.width}.png`});
    await page.getByRole('button',{name:'Écouter un son',exact:true}).scrollIntoViewIfNeeded();
    const r=await page.getByRole('button',{name:'Écouter un son',exact:true}).boundingBox();
    assert(r.y+r.height<=viewport.height, 'Bottom settings unreachable');
    await page.keyboard.press('Escape');
  }
  assert(errors.length===0,errors.join('\n'));
  return {passed:true, themes:8, generalAmbiances:4, errors};
}
