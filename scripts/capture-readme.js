// Run with playwright-cli run-code against Vite in an isolated Chrome session.
// Real browser preview, sample web shortcuts only; no native IPC/hardware mocks.
async (page) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({width:1440,height:1000});
  await page.evaluate(async () => {
    const {defaults} = await import('/src/lib/types.ts');
    const config = defaults();
    config.apps = [
      ['Netflix','netflix','https://www.netflix.com/'],
      ['Spotify','spotify','https://open.spotify.com/'],
      ['Steam','steam','https://store.steampowered.com/'],
      ['Internet','internet','https://www.wikipedia.org/'],
    ].map(([name,theme,value]) => ({id:`readme-${theme}`,name,theme,target:{kind:'uri',value,args:[],workingDir:null},card:null,background:null,icon:null,source:'README sample web shortcut'}));
    config.selectedId = 'readme-netflix';
    config.settings.library.favorites = ['readme-netflix','readme-spotify','readme-steam','readme-internet'];
    config.settings.motion = false;
    config.settings.sound = false;
    localStorage.setItem('canapey-ui-preview-v1', JSON.stringify(config));
  });
  await page.reload();
  await page.locator('.launcher.ready').waitFor();
  const capture = async path => {
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(Array.from(document.images).map(img => img.decode().catch(() => {})));
    });
    await page.waitForTimeout(300);
    await page.screenshot({path,animations:'disabled'});
  };
  await capture('docs/images/home.png');
  await page.getByRole('navigation',{name:'Navigation principale'}).getByRole('button',{name:'Bibliothèque',exact:true}).click();
  await page.getByRole('searchbox',{name:'Rechercher dans la bibliothèque'}).waitFor();
  await capture('docs/images/library.png');
  await page.getByRole('navigation',{name:'Navigation principale'}).getByRole('button',{name:'Accueil',exact:true}).click();
  await page.locator('.app-card').filter({hasText:'Spotify'}).focus();
  await capture('docs/images/ambience.png');
  await page.getByRole('button',{name:'Paramètres',exact:true}).click();
  await page.getByRole('heading',{name:'Affichage et ambiance',exact:true}).waitFor();
  await capture('docs/images/settings.png');
  await page.getByRole('button',{name:'Manettes et télécommandes',exact:true}).click();
  await page.getByRole('button',{name:'Télécommande',exact:true}).click();
  await page.getByRole('button',{name:'Configurer les boutons essentiels',exact:true}).click();
  await page.getByRole('button',{name:'Apprendre la touche',exact:true}).waitFor();
  await capture('docs/images/remote-setup.png');
  await page.setViewportSize({width:390,height:844});
  await capture('output/playwright/readme-remote-mobile.png');
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('Mobile horizontal overflow');
  if (errors.length) throw new Error(errors.join('\n'));
  return {screenshots:5,desktop:'1440x1000',mobileCheck:'390x844',errors,mode:'Browser preview with sample web shortcuts'};
}
