// Run in an isolated system Chrome session against the current Vite page.
async (page) => {
  await page.setViewportSize({width:1440,height:1000});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  const verify=(condition,message)=>{if(!condition)throw new Error(message);};
  await page.addInitScript(() => Object.defineProperty(navigator, 'languages', {value:['fr-CH'],configurable:true}));
  await page.evaluate(async()=>{
    const {defaults}=await import('/src/lib/types.ts');
    const config=defaults();
    delete config.settings.locale;
    config.settings.motion=false;
    config.apps=[{id:'saved-name',name:'Mon cinéma',theme:'home',target:{kind:'uri',value:'https://example.com',args:[],workingDir:null},card:null,background:null,icon:null,source:'user'}];
    localStorage.setItem('canapey-ui-preview-v1',JSON.stringify(config));
    Object.defineProperty(navigator,'languages',{value:['fr-CH'],configurable:true});
  });
  await page.reload();
  await page.locator('.launcher.ready').waitFor();
  verify(await page.locator('html').getAttribute('lang')==='en','Document language must be English');
  verify(await page.evaluate(()=>JSON.parse(localStorage.getItem('canapey-ui-preview-v1')).settings.locale)==='en','Language must be persisted');
  verify(await page.getByText('Mon cinéma',{exact:true}).count()>0,'Saved app name must remain unchanged');
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  const language=page.getByRole('combobox',{name:'Language',exact:true});
  verify(await language.inputValue()==='en','Saved language selection');
  verify(JSON.stringify(await language.locator('option').allTextContents())===JSON.stringify(['English']),'Only English offered');
  await page.screenshot({path:'output/playwright/language-desktop.png'});
  await page.setViewportSize({width:390,height:844});
  await language.scrollIntoViewIfNeeded();
  await page.screenshot({path:'output/playwright/language-mobile.png'});
  verify(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile settings overflow');
  await page.setViewportSize({width:1440,height:1000});
  await page.getByRole('navigation',{name:'Settings categories'}).getByRole('button',{name:'Controls',exact:true}).click();
  await page.getByRole('group',{name:'Controls',exact:true}).getByRole('button',{name:'Remote',exact:true}).click();
  // The photo is outside the optional essential-buttons guide.
  await page.locator('.remote-hotspot').first().waitFor();
  verify(await page.locator('.remote-hotspot').count()>20,'Remote picture hit areas should remain available');
  const image=page.locator('img[src*="skip"]');
  verify(await image.evaluate(img=>img.complete&&img.naturalWidth>0),'Remote photo must load');
  await page.screenshot({path:'output/playwright/language-remote-photo.png'});
  await page.keyboard.press('Escape');
  await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'Library',exact:true}).click();
  await page.getByRole('searchbox',{name:'Search the library'}).focus();
  await page.keyboard.press('F2');
  if(await page.locator('.keyboard-panel').count()===0){
    await page.getByRole('button',{name:'Library keyboard',exact:true}).click();
  }
  await page.locator('.keyboard-panel').waitFor();
  verify((await page.locator('.keyboard-row').first().innerText()).replace(/\s/g,'')==='qwertyuiop','English QWERTY layout');
  await page.screenshot({path:'output/playwright/language-keyboard.png'});
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.reload();
  await page.locator('.launcher.ready').waitFor();
  verify(await page.evaluate(()=>JSON.parse(localStorage.getItem('canapey-ui-preview-v1')).settings.locale)==='en','Language persists after reload');
  verify(errors.length===0,errors.join('\n'));
  return {passed:true,desktop:'1440x1000',mobile:'390x844',errors};
}
