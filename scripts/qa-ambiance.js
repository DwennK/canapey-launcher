// Playwright CLI, fresh Chrome context. Checks saved appearance/audio preferences.
async (page) => {
  const context=await page.context().browser().newContext({viewport:{width:1440,height:900}});
  page=await context.newPage();
  try {
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const assert=(ok,message)=>{if(!ok)throw Error(message)};
    await page.addInitScript(()=>{
      window.__soundGains=[];
      const createGain=AudioContext.prototype.createGain;
      AudioContext.prototype.createGain=function(){const node=createGain.call(this),set=node.gain.setValueAtTime.bind(node.gain);node.gain.setValueAtTime=(value,time)=>{window.__soundGains.push(value);return set(value,time)};return node;};
    });
    await page.goto('http://127.0.0.1:1420');await page.locator('main.ready').waitFor();
    const button=name=>page.getByRole('button',{name,exact:true});
    const slider=name=>page.getByRole('slider',{name:new RegExp(name)});
    const setRange=async(name,value)=>{await slider(name).fill(String(value));await slider(name).dispatchEvent('change');};
    const appearance=async()=>{await button('Settings').click();};
    await appearance();await button('Ambience').click();
    await button('Arcade').click();await page.getByRole('switch',{name:/Per-app background/}).uncheck();
    await setRange('Background brightness',.65);await setRange('Background blur',6);
    await page.waitForFunction(()=>getComputedStyle(document.querySelector('.backdrop-current')).filter==='brightness(0.65) blur(6px)');
    await page.getByRole('switch',{name:/Animations/}).uncheck();
    assert(await page.locator('main.reduce-motion').count()===1,'Reduced motion not applied');
    await slider('Background blur').focus();await page.keyboard.press('ArrowRight');
    assert(await slider('Background blur').inputValue()==='7','Direct slider adjustment failed');
    await page.keyboard.press('Escape');await button('Sound').click();
    const sound=page.getByRole('switch',{name:'Navigation sounds',exact:true});await sound.check();
    await setRange('Sound volume',.25);await button('Preview sound').click();
    assert(await page.evaluate(()=>window.__soundGains.at(-1)===.009),'Sound volume not applied');
    await sound.uncheck();assert(await slider('Sound volume').isDisabled()&&await button('Preview sound').isDisabled(),'Muted controls remain active');
    await sound.focus();await page.keyboard.press('ArrowDown');
    assert(await sound.evaluate(el=>document.activeElement===el),'Down focused a disabled sound control');
    await page.waitForFunction(()=>{const s=JSON.parse(localStorage.getItem('canapey-ui-preview-v1')).settings;return s.backgroundBlur===7&&s.soundVolume===.25&&!s.sound;});
    await page.reload();await appearance();await button('Ambience').click();
    assert(await slider('Background brightness').inputValue()==='0.65'&&await slider('Background blur').inputValue()==='7','Appearance did not survive reload');
    await page.keyboard.press('Escape');await button('Sound').click();
    assert(await slider('Sound volume').inputValue()==='0.25'&&!await sound.isChecked(),'Sound did not survive reload');
    assert(!errors.length,errors.join('\n'));
    return {passed:true,checks:['separate ambience and sound pages','background effects','direct sliders','audio gain','disabled controls skipped','saved preferences survive reload'],errors};
  } finally {await context.close();}
}
