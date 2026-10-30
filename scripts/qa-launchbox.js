// Isolated browser preview; the library below is synthetic, not a Windows installation.
async (page) => {
  await page.setViewportSize({width:1440,height:900});
  const errors=[]; page.on('pageerror', e=>errors.push(e.message));
  const assert=(ok,msg)=>{if(!ok)throw Error(msg)};
  await page.evaluate(async()=>{
    const {defaults}=await import('/src/lib/types.ts');
    const config=defaults();config.settings.motion=false;config.settings.locale='en';
    config.apps=[{id:'qa-launchbox',name:'LaunchBox',theme:'launchbox',target:{kind:'executable',value:'C:\\Games\\LaunchBox\\LaunchBox.exe',args:[],workingDir:'C:\\Games\\LaunchBox'},card:null,background:null,icon:null,source:'QA fixture'}];
    config.selectedId='qa-launchbox';localStorage.setItem('canapey-ui-preview-v1',JSON.stringify(config));
  });
  await page.reload();await page.locator('main.ready').waitFor();
  await page.waitForFunction(()=>document.querySelector('.backdrop-current')?.getAttribute('src')==='/art/launchbox.webp');
  await page.waitForFunction(()=>[...document.images].filter(i=>i.src.includes('/art/launchbox')).every(i=>i.complete && i.naturalWidth>0));
  await page.screenshot({path:'output/playwright/launchbox-desktop.png'});
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.getByRole('button',{name:'Display and ambience',exact:true}).click();
  const arcade=page.getByRole('button',{name:'Arcade',exact:true});
  await arcade.click();
  await page.getByRole('switch',{name:/Per-app background/}).uncheck();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('canapey-ui-preview-v1')).settings.generalAmbiance==='launchbox');
  assert(await arcade.getAttribute('aria-pressed')==='true','Arcade selection not visible');
  await arcade.scrollIntoViewIfNeeded();
  await page.screenshot({path:'output/playwright/launchbox-ambience-desktop.png'});
  await page.reload();await page.locator('main.ready').waitFor();
  assert(await page.evaluate(()=>JSON.parse(localStorage.getItem('canapey-ui-preview-v1')).settings.generalAmbiance)==='launchbox','Arcade preference lost');
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'output/playwright/launchbox-mobile.png'});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=390),'Mobile overflow');
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.getByRole('button',{name:'Display and ambience',exact:true}).click();
  await arcade.scrollIntoViewIfNeeded();
  await page.screenshot({path:'output/playwright/launchbox-ambience-mobile.png'});
  assert(!errors.length, errors.join(';'));
  return {passed:true,viewports:['1440x900','390x844'],errors};
}
