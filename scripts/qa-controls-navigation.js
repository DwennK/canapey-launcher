// Playwright CLI run-code, isolated system Chrome. Simulated IPC verifies routing,
// not physical controller hardware, TV commands or Windows power transitions.
async (page) => {
  const origin = page.url();
  const context = await page.context().browser().newContext({viewport:{width:1440,height:900}});
  page = await context.newPage();
  try {
  const errors = [], checks = [];
  page.on('pageerror', error => errors.push(error.message));
  const assert = (value, message) => { if (!value) throw Error(message); };
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(origin);
  const config = await page.evaluate(async () => (await import('/src/lib/types.ts')).defaults());
  await page.addInitScript(config => {
    const callbacks = new Map(), events = new Map(); let id = 0;
    config.settings.motion = false; config.settings.sound = false;
    config.apps = [{id:'qa',name:'QA app',theme:'home',target:{kind:'executable',value:'C:\\QA\\App.exe',args:[],workingDir:null},card:null,background:null,icon:null,source:'QA'}];
    window.isTauri = true;
    window.__menuQA = { config, capturing:false, emit(event, payload) { callbacks.get(events.get(event))?.({ event, id: 1, payload }); } };
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: event => events.delete(event) };
    window.__TAURI_INTERNALS__ = {
      transformCallback: fn => { callbacks.set(++id, fn); return id; }, unregisterCallback: id => callbacks.delete(id), convertFileSrc: path => path,
      invoke: async (command, args = {}) => {
        if (command === 'plugin:event|listen') { events.set(args.event,args.handler); return args.handler; }
        if (command === 'bootstrap') return { config:window.__menuQA.config,native:true,version:'0.7.1',warning:null,sessions:[],controller:'Xbox Wireless Controller (QA)' };
        if (command === 'save_config') { window.__menuQA.config = structuredClone(args.config); return window.__menuQA.config; }
        if (command === 'list_monitors') return [{id:'tv',name:'Living room TV',primary:false}];
        if (command === 'audio_state') return {outputs:[],defaultId:null,volume:null,muted:false};
        if (command === 'apple_remote_status') return {available:true,running:false,networks:[],address:null,error:null,pairing:{pin:null,secondsRemaining:0,devices:[]}};
        if (command === 'remote_home_status') return {available:true,active:[],error:null};
        if (command === 'set_remote_capture') { window.__menuQA.capturing=args.enabled; return null; }
        if (command === 'scan_apps') return [];
        if (command === 'tv_status') return {available:true,tv:null,autoWake:false,autoStandby:false,waking:false,resumeAvailable:true,message:null,error:null};
        return null;
      },
    };
  }, config);
  await page.reload();
  const open = async () => {
    await page.locator('.overlay').waitFor({state:'hidden'});
    await page.getByRole('button',{name:'Settings',exact:true}).click();
    await page.waitForFunction(() => document.querySelector('.overlay') && getComputedStyle(document.querySelector('.overlay')).opacity === '1');
  };
  const route = async name => { await page.locator(`[data-settings-page="${name}"]`).waitFor(); };
  const enter = async name => { await page.locator(`[data-settings-route="${name}"]`).click(); await route(name); };
  const activeRoute = () => page.locator(':focus').getAttribute('data-settings-route');
  const emit = async (action, source='controller') => {
    await page.evaluate(({action,source}) => {
      if(source==='controller') window.__menuQA.emit('input',action);
      else if(source==='iphone') window.__menuQA.emit('apple-input',{action,connection:1});
      else {
        const binding={button:'qa-'+action,action,key:{key:'',code:'',ctrl:false,alt:false,shift:false,meta:false},global:true,appId:null};
        window.__menuQA.emit('remote-action',{binding,pressed:true});
        window.__menuQA.emit('remote-action',{binding,pressed:false});
      }
    },{action,source});
  };
  await open();
  const pages = ['display','ambience','sound','apps','controls','remote','iphone','tv','system','updates','diagnostic'];
  assert(await activeRoute()==='display', 'Settings must open with the saved page focused');
  for (const source of ['controller','iphone','remote']) {
    await page.locator('[data-settings-route=display]').focus();
    await emit('down', source);
    assert(await activeRoute()==='ambience', source+' lost rail focus');
    await route('display');
    await emit('right', source); await route('ambience');
    await emit('back', source);
    assert(await activeRoute()==='ambience', source+' Back lost the active page');
    await enter('display');
    await emit('back', source);
  }
  checks.push('controller, iPhone and remote focus, explicit selection and Back');
  await page.keyboard.press('Control+f');
  const search=page.getByRole('searchbox',{name:'Search settings'});
  await search.fill('no-such-setting');
  await page.getByText('No matching settings.').waitFor();
  await search.fill('HDMI');
  assert(await page.locator('[data-settings-route]').count()===1,'HDMI should resolve to TV');
  await search.press('ArrowDown'); assert(await activeRoute()==='tv','Down should reach the first match');
  await page.keyboard.press('Enter'); await route('tv');
  await page.keyboard.press('Control+f'); await search.fill('zoom'); await search.press('Enter'); await route('display');
  await page.keyboard.press('Control+f'); await search.press('Escape');
  assert(await page.locator('[data-settings-route]').count()===11,'Cancel should restore the full sidebar');
  checks.push('settings search with empty results, keyboard navigation, submit and cancel');
  await enter('display');
  const monitor=page.getByLabel(/Preferred display/);
  await monitor.focus(); await page.keyboard.press('Enter');
  await page.getByRole('dialog',{name:'Preferred display',exact:true}).waitFor();
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
  await page.waitForFunction(()=>window.__menuQA.config.settings.monitor==='tv');
  assert(await monitor.evaluate(el=>document.activeElement===el),'Choice lost original focus');
  await page.keyboard.press('Enter'); await page.keyboard.press('ArrowUp'); await page.keyboard.press('Escape');
  assert(await monitor.inputValue()==='tv','Cancel changed selected monitor');
  await page.keyboard.press('ArrowDown');
  const slider=page.getByLabel(/Interface size/), before=Number(await slider.inputValue());
  assert(await slider.evaluate(el=>document.activeElement===el),'Down did not reach slider');
  await page.keyboard.press('ArrowRight');
  assert(Number(await slider.inputValue())>before,'Right did not adjust slider immediately');
  const adjusted=await slider.inputValue();
  await page.keyboard.press('ArrowUp');
  assert(await slider.inputValue()===adjusted && await monitor.evaluate(el=>document.activeElement===el),'Up changed slider value or failed to leave it');
  await slider.fill('1'); await slider.dispatchEvent('change');
  checks.push('large choice dialog, cancel, focus restoration, direct slider adjustment');
  await page.keyboard.press('Escape');
  assert(await activeRoute()==='display','Back did not restore Display');
  for(const name of pages) {
    await enter(name);
    await page.waitForFunction(()=>document.querySelector('.settings-page')?.children.length>0);
    const result=await page.evaluate(async()=>{
      const {focusableItems,focusElement,focusDirection}=await import('/src/lib/navigation.ts');
      const root=document.querySelector('.settings-content'), items=focusableItems(root), escaped=[];
      for(const item of items)for(const direction of ['up','down','left','right']){
        focusElement(item);focusDirection(root,direction);
        if(!root.contains(document.activeElement))escaped.push(item.textContent);
      }
      focusElement(items.at(-1));focusDirection(root,'down');
      return {escaped,count:items.length,inPage:root.contains(document.activeElement)};
    });
    assert(!result.escaped.length && result.inPage,`${name}: focus escaped the page`);
    await emit('back');
  }
  checks.push('all 11 pages keep directional focus in their content');
  await enter('remote');
  await page.getByRole('button',{name:'Learn key',exact:true}).click();
  await page.waitForFunction(()=>window.__menuQA.capturing);
  await emit('back','remote'); await route('remote');
  await page.evaluate(()=>window.__menuQA.emit('remote-home-captured',{code:'KeyZ',ctrl:false,alt:false,shift:false}));
  await page.waitForFunction(()=>!window.__menuQA.capturing);
  await emit('back','remote'); assert(await activeRoute()==='remote','Remote capture did not release navigation');
  checks.push('remote editor navigation resumes after key learning');
  await enter('apps');
  await page.getByRole('button',{name:'Add',exact:true}).click();
  await page.getByRole('dialog',{name:'Add apps',exact:true}).waitFor();
  await page.keyboard.press('Escape'); await route('apps');
  assert(await page.locator(':focus').innerText()==='Add','Closing nested dialog lost focus');
  await enter('tv');
  await page.getByText('My TV is not listed',{exact:true}).click();
  const ip=page.getByLabel('TV IP address',{exact:true}); await ip.focus();
  await emit('accept-down'); await emit('accept-up');
  await page.locator('.keyboard-panel').waitFor();
  await emit('right'); await emit('accept-down'); await emit('accept-up');
  assert(await page.locator('.keyboard-panel textarea').inputValue()==='w','Directional keyboard typed the wrong character');
  await emit('down'); await emit('down'); await emit('down');
  assert(await page.locator(':focus').evaluate(el=>!!el.closest('.keyboard-panel')),'Keyboard directions escaped the dialog');
  await emit('back');
  await page.waitForFunction(()=>!document.querySelector('.keyboard-panel'));
  assert(await ip.evaluate(el=>document.activeElement===el),'On-screen keyboard did not restore TV input');
  await page.screenshot({path:'output/playwright/settings-tv-desktop.png'});
  checks.push('nested Add dialog and controller text-entry return focus');
  await page.getByRole('button',{name:'Close settings'}).click();
  for(const viewport of [{width:390,height:844},{width:1440,height:900}]) {
    await page.setViewportSize(viewport);
    await open();
    for(const name of pages) {
      await enter(name);
      await page.waitForFunction(()=>document.querySelector('.settings-page')?.children.length>0);
      const overflow=await page.evaluate(()=>{const el=document.querySelector('.settings-content');return el.scrollWidth>el.clientWidth+1 || document.documentElement.scrollWidth>innerWidth;});
      assert(!overflow,`${name}: horizontal overflow at ${viewport.width}`);
      assert(await page.locator('.settings-rail [aria-current=page]').getAttribute('data-settings-route')===name,'Sidebar and detail selection disagree');
      if (['display','ambience','tv'].includes(name)) {
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await page.screenshot({animations:'disabled',path:`output/playwright/aqua-${name}-${viewport.width}.png`});
      }
      await emit('back');
      assert(await activeRoute()===name,`${name}: Back failed at ${viewport.width}`);
    }
    await emit('back');
  }
  checks.push('all eleven pages on desktop and compact layout, Back and overflow');
  await page.setViewportSize({width:1920,height:1080}); await open(); await enter('display');
  await slider.fill('1.4'); await slider.dispatchEvent('change');
  await enter('controls');
  await page.getByRole('button',{name:'Xbox / Steam Input troubleshooting',exact:true}).focus();
  assert(await page.locator(':focus').evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;}),'Last controller setting is unreachable at maximum scale');
  checks.push('1920×1080 TV at maximum scale');
  await page.setViewportSize({width:1280,height:720});
  await enter('display'); await emit('back');
  for (const name of pages.slice(1)) {
    await emit('down');
    assert(await activeRoute()===name, 'Scrolled sidebar skipped '+name+' on Down');
  }
  for (const name of pages.slice(0,-1).reverse()) {
    await emit('up');
    assert(await activeRoute()===name, 'Scrolled sidebar skipped '+name+' on Up');
  }
  checks.push('full traversal of the scrolled sidebar at 720p and 140%');

  await enter('sound');
  await page.waitForFunction(()=>window.__menuQA.config.settings.lastSettingsTab==='sound');
  await emit('back'); await emit('back'); await open(); await route('sound');
  assert(await activeRoute()==='sound','Last used page was not restored');
  assert(!errors.length,errors.join('\n'));
  return {passed:true,checks,viewports:['1440×900','390×844'],hardware:'simulated events only'};
  } finally { await context.close(); }
}
