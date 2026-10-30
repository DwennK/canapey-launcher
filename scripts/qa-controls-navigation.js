// Playwright CLI run-code, isolated system Chrome. Simulated IPC verifies routing,
// not physical controller hardware, TV commands or Windows power transitions.
async (page) => {
  const context = await page.context().browser().newContext({viewport:{width:1440,height:900}});
  page = await context.newPage();
  try {
  const errors = [], checks = [];
  page.on('pageerror', error => errors.push(error.message));
  const assert = (value, message) => { if (!value) throw Error(message); };
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://127.0.0.1:1420');
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
  await emit('down'); await emit('up');
  await page.screenshot({path:'output/playwright/settings-root-desktop.png'});
  for(const source of ['controller','iphone','remote']) {
    await page.locator('[data-settings-route=appearance]').focus();
    await emit('down',source); await page.waitForFunction(()=>document.activeElement?.getAttribute('data-settings-route')==='apps');
    await emit('down',source); await page.waitForFunction(()=>document.activeElement?.getAttribute('data-settings-route')==='devices');
    await emit('accept',source); await route('devices');
    await emit('back',source); await route('root');
    assert(await activeRoute()==='devices',`${source}: Back lost the category selection`);
  }
  checks.push('controller / iPhone / remote event routing and Back restoration');
  for(let i=0;i<8;i++)await emit('down');
  assert(await activeRoute()==='help','Down at the last category must stop');
  await emit('right'); assert(await activeRoute()==='help','Right must not escape a category row');
  for(let i=0;i<8;i++)await emit('up');
  assert(await activeRoute()==='appearance','Up at the first category must stop');
  await enter('appearance'); await enter('display');
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
  await page.keyboard.press('Escape'); await route('appearance');
  assert(await activeRoute()==='display','Back did not restore Display');
  await page.keyboard.press('Escape'); await route('root');
  const paths=[['appearance','display'],['appearance','ambience'],['appearance','sound'],['apps'],['devices','controls'],['devices','remote'],['devices','iphone'],['devices','tv'],['system'],['help','updates'],['help','diagnostic']];
  for(const path of paths) {
    for(const name of path) await enter(name);
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
    assert(!result.escaped.length && result.inPage,`${path}: focus escaped the page`);
    for(let i=0;i<path.length;i++)await page.keyboard.press('Escape');
    await route('root');
  }
  checks.push('all 11 pages keep directional focus in their content');
  await enter('devices'); await enter('remote');
  await page.getByRole('button',{name:'Learn key',exact:true}).click();
  await page.waitForFunction(()=>window.__menuQA.capturing);
  await emit('back','remote'); await route('remote');
  await page.evaluate(()=>window.__menuQA.emit('remote-home-captured',{code:'KeyZ',ctrl:false,alt:false,shift:false}));
  await page.waitForFunction(()=>!window.__menuQA.capturing);
  await emit('back','remote'); await route('devices');
  await page.keyboard.press('Escape'); await route('root');
  checks.push('remote editor navigation resumes after key learning');
  await enter('apps');
  await page.getByRole('button',{name:'Add',exact:true}).click();
  await page.getByRole('dialog',{name:'Add apps',exact:true}).waitFor();
  await page.keyboard.press('Escape'); await route('apps');
  assert(await page.locator(':focus').innerText()==='Add','Closing nested dialog lost focus');
  await page.keyboard.press('Escape'); await enter('devices'); await enter('tv');
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
  // Leave explicit text editing, then return to the root.
  await page.keyboard.press('Escape');
  if(await page.locator('[data-settings-page=tv]').count())await page.keyboard.press('Escape');
  await page.keyboard.press('Escape'); await route('root');
  for(const viewport of [{width:390,height:844},{width:1440,height:900}]) {
    await page.setViewportSize(viewport);
    for(const path of paths) {
      for(const name of path) await enter(name);
      await page.waitForFunction(()=>document.querySelector('.settings-page')?.children.length>0);
      const overflow=await page.evaluate(()=>{const el=document.querySelector('.settings-content');return el.scrollWidth>el.clientWidth+1 || document.documentElement.scrollWidth>innerWidth;});
      assert(!overflow,`${path}: horizontal overflow at ${viewport.width}`);
      if(['controls','ambience','tv'].includes(path.at(-1)))await page.screenshot({path:`output/playwright/settings-${path.at(-1)}-${viewport.width}.png`});
      for(let i=0;i<path.length;i++)await page.keyboard.press('Escape');
      await route('root');
    }
  }
  checks.push('desktop and mobile layout on every page');
  await enter('appearance'); await enter('display');
  await page.getByLabel(/Interface size/).fill('1.4'); await page.getByLabel(/Interface size/).dispatchEvent('change');
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  await page.setViewportSize({width:1920,height:1080}); await enter('devices'); await enter('controls');
  await page.getByRole('button',{name:'Xbox / Steam Input troubleshooting',exact:true}).focus();
  assert(await page.locator(':focus').evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;}),'Last controller setting is unreachable at maximum scale');
  await page.screenshot({path:'output/playwright/settings-controls-tv-scale.png'});
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  checks.push('1920×1080 TV layout at maximum interface size');
  await enter('appearance'); await enter('sound');
  await page.waitForFunction(()=>window.__menuQA.config.settings.lastSettingsTab==='sound');
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  await open(); assert(await activeRoute()==='appearance','Last used category was not highlighted');
  assert(!errors.length,errors.join('\n'));
  return {passed:true,checks,viewports:['1440×900','390×844'],hardware:'simulated events only'};
  } finally { await context.close(); }
}
