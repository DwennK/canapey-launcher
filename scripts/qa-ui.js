// Run in the isolated Playwright CLI session: see docs/VALIDATION.md.
async (page) => {
  const errors=[]; const external=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:1420')&&!r.url().startsWith('data:'))external.push(r.url())});
  await page.setViewportSize({width:1440,height:900});
  await page.evaluate(()=>localStorage.removeItem('canapey-ui-preview-v1'));
  await page.reload();
  await page.getByRole('heading',{name:'Ajouter des applications',exact:true}).waitFor();
  const assert=async(condition,message)=>{if(!await condition)throw new Error(message)};
  const selected=()=>page.locator('.cards .app-card[aria-pressed="true"]');
  await assert((await page.locator('.cards .app-card').count())===9,'Honest empty-state suggestions missing');
  await assert((await page.locator('.hero button').count())===0,'Redundant hero action remains');
  await page.keyboard.press('ArrowUp');
  await assert(page.evaluate(()=>document.activeElement instanceof HTMLButtonElement&&!document.activeElement.closest('.cards')),'Up should reach a remaining control');
  await page.keyboard.press('Escape');
  await assert(selected().evaluate(el=>el===document.activeElement),'Back should restore the selected card');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  await assert(page.locator('.cards.grid').isVisible(),'Down should open grid');
  await assert((await selected().getAttribute('aria-label')).includes('Netflix'),'Selection lost on grid entry');
  await page.keyboard.press('ArrowUp');
  await assert(page.locator('.cards.carousel').isVisible(),'Up from first row should return');
  for(let i=0;i<8;i++)await page.keyboard.press('ArrowRight');
  await page.waitForFunction(()=>{const r=document.querySelector('.cards [aria-pressed="true"]').getBoundingClientRect();return r.x>=0&&r.right<=innerWidth});
  for(let i=0;i<8;i++)await page.keyboard.press('ArrowLeft');
  await page.waitForFunction(()=>document.querySelector('.backdrop-current').getAttribute('src')==='/art/home.webp');
  await page.keyboard.press('Enter');
  await page.getByRole('dialog',{name:'Ajouter des applications'}).waitFor();
  await assert((await page.locator('.web-section, .web-presets, .web-form').count())===0,'Web creation controls remain');
  await page.getByText('La détection et l’ajout d’applications sont disponibles sous Windows.').waitFor();
  await page.screenshot({animations:'disabled',path:'output/playwright/add-preview-desktop.png'});
  await page.keyboard.press('Escape');
  // Existing URI shortcuts must remain editable after removing their creation UI.
  await page.evaluate(async()=>{
    const {defaults}=await import('/src/lib/types.ts');
    const config=defaults();
    config.apps=[['Netflix','https://www.netflix.com/'],['YouTube','https://www.youtube.com/'],['Spotify','https://open.spotify.com/'],['Internet','https://www.google.com/']].map(([name,url])=>({
      id:name.toLowerCase(), name, theme:name.toLowerCase(),
      target:{kind:'uri',value:url,args:[],workingDir:null},
      card:null,background:null,icon:null,source:'Existing shortcut QA fixture'
    }));
    config.selectedId='internet';
    localStorage.setItem('canapey-ui-preview-v1',JSON.stringify(config));
  });
  await page.reload();
  await page.getByRole('heading',{name:'Internet',exact:true}).waitFor();
  const webApps=await page.evaluate(()=>JSON.parse(localStorage.getItem('canapey-ui-preview-v1')).apps);
  for (const [name,theme,url] of [['Spotify','spotify','https://open.spotify.com/'],['Internet','internet','https://www.google.com/']]) {
    const app=webApps.find(a=>a.name===name);
    await assert(app?.theme===theme&&app?.target.kind==='uri'&&app?.target.value===url,`${name} theme/target did not persist`);
    await assert(page.locator(`.cards .app-card.${theme} .web-label`).isVisible(),`${name} missing WEB label`);
  }
  const checkRememberedSelection = async () => {
    // Reload immediately: selection must not depend on the former 350 ms timer.
    await page.getByRole('button',{name:'Spotify',exact:true}).focus();
    await page.reload();
    await page.getByRole('heading',{name:'Spotify',exact:true}).waitFor();
    for (const utility of ['Retour Windows', 'Ajouter']) {
      await page.getByRole('button',{name:'Internet',exact:true}).focus();
      await page.getByRole('button',{name:utility,exact:true}).focus();
      // Stay on a utility card beyond the old debounce to catch null saves.
      await page.waitForTimeout(450);
      await page.reload();
      await page.getByRole('heading',{name:'Internet',exact:true}).waitFor();
      await assert(selected().evaluate(el=>el===document.activeElement),'Restored application should receive focus');
    }
  };
  await checkRememberedSelection();
  await page.getByRole('button',{name:'YouTube',exact:true}).focus();
  await page.keyboard.press('F1');
  await page.getByRole('button',{name:'Applications',exact:true}).click();
  await page.getByRole('button',{name:'Avancer YouTube',exact:true}).click();
  await page.getByRole('button',{name:'Modifier YouTube',exact:true}).click();
  await page.getByRole('textbox',{name:'Nom',exact:true}).fill('YouTube salon');
  await page.getByRole('button',{name:'Enregistrer',exact:true}).click();
  await page.keyboard.press('Escape');
  await page.reload();
  await page.getByRole('heading',{name:'YouTube salon',exact:true}).waitFor();
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('canapey-ui-preview-v1')));
  await assert(saved.apps[0].name==='YouTube salon'&&saved.apps[0].target.kind==='uri','Order/name/URI persistence failed');
  await page.keyboard.press('Enter');
  await page.getByRole('status').filter({hasText:'Cette action nécessite'}).waitFor();
  await page.keyboard.press('F1');
  await page.getByRole('button',{name:'Mises à jour',exact:true}).click();
  await page.getByRole('button',{name:'Rechercher une mise à jour',exact:true}).click();
  await page.getByText('Les mises à jour ne sont pas encore configurées pour cette distribution.').waitFor();
  await page.getByRole('button',{name:'Manette & ambiance',exact:true}).click();
  await page.getByRole('combobox').selectOption('disabled');
  await page.getByRole('switch',{name:'Sons de navigation',exact:true}).check();
  await page.getByRole('dialog',{name:'Paramètres'}).waitFor();
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('.overlay')).opacity==='1');
  await page.screenshot({animations:'disabled',path:'output/playwright/settings-desktop.png'});
  await page.getByRole('navigation',{name:'Catégories des paramètres'}).getByRole('button',{name:'Alimentation',exact:true}).click();
  await page.getByRole('button',{name:'Éteindre',exact:true}).click();
  await page.getByRole('dialog',{name:'Éteindre le PC ?'}).waitFor();
  await page.getByRole('button',{name:'Annuler',exact:true}).click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('F1');
  await page.getByRole('button',{name:'Applications',exact:true}).click();
  await page.getByRole('button',{name:'Modifier Netflix',exact:true}).click();
  await page.getByRole('button',{name:'Retirer',exact:true}).click();
  await page.getByRole('dialog',{name:'Retirer cette carte ?'}).waitFor();
  await page.getByRole('button',{name:'Annuler',exact:true}).click();
  await page.getByRole('button',{name:'Retirer',exact:true}).click();
  await page.getByRole('dialog',{name:'Retirer cette carte ?'}).getByRole('button',{name:'Retirer',exact:true}).click();
  await page.getByRole('button',{name:'Modifier YouTube salon',exact:true}).waitFor();
  await assert((await page.evaluate(()=>JSON.parse(localStorage.getItem('canapey-ui-preview-v1')).apps.length))===3,'Removal did not persist');
  await page.keyboard.press('Escape');
  await page.setViewportSize({width:390,height:844});
  await checkRememberedSelection();
  await page.getByRole('button',{name:'Internet',exact:true}).focus();
  await page.waitForFunction(()=>document.querySelector('.backdrop-current').getAttribute('src')==='/art/internet.webp');
  await page.screenshot({animations:'disabled',path:'output/playwright/home-mobile.png'});
  await page.keyboard.press('ArrowDown');
  await page.screenshot({animations:'disabled',path:'output/playwright/grid-mobile.png'});
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Ajouter',exact:true}).click();
  await page.getByRole('dialog',{name:'Ajouter des applications'}).waitFor();
  await page.screenshot({animations:'disabled',path:'output/playwright/add-mobile.png'});
  await assert(page.evaluate(()=>document.documentElement.scrollWidth===innerWidth),'Mobile import overflow');
  await page.keyboard.press('Escape');
  await page.keyboard.press('F1');
  await page.getByRole('dialog',{name:'Paramètres'}).waitFor();
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('.overlay')).opacity==='1');
  await page.screenshot({animations:'disabled',path:'output/playwright/settings-mobile.png'});
  await assert(page.evaluate(()=>document.documentElement.scrollWidth===innerWidth),'Mobile overflow');
  await page.keyboard.press('Escape');
  await page.setViewportSize({width:1440,height:900});
  await page.route('**/*',route=>route.request().url().startsWith('http://127.0.0.1:1420')?route.continue():route.abort());
  await page.evaluate(()=>localStorage.setItem('canapey-ui-preview-v1','{broken'));
  await page.reload();
  await page.getByRole('heading',{name:'Ajouter des applications',exact:true}).waitFor();
  await page.waitForFunction(()=>[...document.images].filter(i=>i.getBoundingClientRect().x<innerWidth).every(i=>i.complete&&i.naturalWidth>0));
  await page.screenshot({animations:'disabled',path:'output/playwright/home-desktop.png'});
  await page.keyboard.press('ArrowDown');
  await page.screenshot({animations:'disabled',path:'output/playwright/grid-desktop.png'});
  await page.keyboard.press('Escape');
  await page.evaluate(()=>localStorage.removeItem('canapey-ui-preview-v1'));
  await assert(errors.length===0,`Runtime errors: ${errors.join('; ')}`);
  await assert(external.length===0,`External requests: ${external.join('; ')}`);
  return {result:'passed',viewport:'1440×900 + 390×844',errors,external,checked:['carousel/grid/focus','rapid selection/background cancellation','web creation removed; existing URI compatibility','edit/reorder/persist','safe unavailable native actions','updates unconfigured','power confirmation cancel','remove confirmation','corrupt browser config','no external network','mobile layout']};
}
