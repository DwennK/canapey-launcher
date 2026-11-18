// Playwright CLI run-code. Windows discovery, file dialogs and controller events use a local IPC fixture.
async (page) => {
  const origin = page.url();
  const browser = page.context().browser();
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const errors = [];
  const inspect = p => p.on('pageerror', error => errors.push(error.message));
  const dialog = p => p.getByRole('dialog', {name:'Add apps', exact:true});
  const search = p => dialog(p).getByRole('searchbox');
  const button = (p, name) => dialog(p).getByRole('button', {name, exact:true});
  const open = async p => {
    await p.getByRole('button',{name:'Library',exact:true}).click();
    await p.getByRole('button',{name:'Add',exact:true}).click();
    await dialog(p).waitFor();
  };
  const layout = async p => {
    assert(await dialog(p).evaluate(el => {
      const r = el.getBoundingClientRect(), footer = el.querySelector('footer').getBoundingClientRect();
      return r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && footer.bottom <= innerHeight &&
        ![el,...el.querySelectorAll('.picker-tools,.picker-list,footer')].some(n => n.scrollWidth > n.clientWidth + 1);
    }), 'Picker or footer outside viewport');
  };
  const shot = async (p,name) => {
    await p.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await p.screenshot({animations:'disabled',path:'output/playwright/add-picker-'+name+'.png'});
  };
  const context = await browser.newContext({viewport:{width:1440,height:900}});
  try {
    const p = await context.newPage(); inspect(p); await p.goto(origin); await open(p);
    assert(await button(p,'Choose file…').count()===0, 'Preview exposed native discovery');
    await dialog(p).getByRole('button',{name:'Netflix',exact:true}).click();
    await search(p).fill('spotify'); await search(p).press('ArrowDown'); await p.keyboard.press('Enter');
    await p.keyboard.press('ArrowRight');
    assert(await button(p,'Add 2 apps').evaluate(el=>el===document.activeElement),'Right did not reach Add');
    await p.keyboard.press('ArrowUp');
    assert(await button(p,'Spotify').evaluate(el=>el===document.activeElement),'Up did not return to the selected row');
    await button(p,'Clear search').click();
    await layout(p); await shot(p,'preview');
    const top = (await search(p).boundingBox()).y;
    await search(p).fill('no such app');
    await p.getByText('No matches for “no such app”').waitFor();
    assert(Math.abs(top-(await search(p).boundingBox()).y)<1,'Filtering moved the search field');
    await p.locator('.picker-message button').click();
    await button(p,'Search keyboard').click(); await p.locator('.keyboard-panel textarea').fill('spotify');
    await p.getByRole('button',{name:'Done',exact:true}).click();
    assert(await search(p).inputValue()==='spotify','On-screen keyboard did not update the filter');
    await button(p,'Add 2 apps').click(); await dialog(p).waitFor({state:'hidden'});
    await p.reload(); await open(p);
    assert(await p.locator('[data-app-row]:disabled').count()===2,'Saved sample cards or duplicate protection lost');
    await button(p,'Steam').click(); await button(p,'Cancel').click(); await open(p);
    assert(await button(p,'Steam').getAttribute('aria-pressed')==='false','Cancel retained a pending selection');
    await p.setViewportSize({width:390,height:844}); await button(p,'Plezy').click(); await layout(p); await shot(p,'mobile');
  } finally { await context.close(); }

  const native = await browser.newContext({viewport:{width:1440,height:900}});
  try {
    const p=await native.newPage(); inspect(p); await p.goto(origin);
    const config=await p.evaluate(async()=> (await import('/src/lib/types.ts')).defaults());
    await p.addInitScript(cfg=>{
      const callbacks=new Map(), handlers=new Map(); let id=0;
      cfg.settings.motion=false; cfg.settings.sound=false;
      const app=(name,file=name+'.exe')=>({name,id:name,theme:'home',icon:null,card:null,background:null,
        source:'Windows app',target:{kind:'executable',value:'C:\\Apps\\'+file,args:[],workingDir:null}});
      const qa=window.pickerQA={config:cfg,scanCount:0,mode:'fail',file:null,failSave:false,
        emit(action){callbacks.get(handlers.get('input'))?.({event:'input',id:1,payload:action});}};
      window.isTauri=true;
      window.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener:event=>handlers.delete(event)};
      window.__TAURI_INTERNALS__={
        transformCallback:fn=>{callbacks.set(++id,fn);return id;}, unregisterCallback:i=>callbacks.delete(i), convertFileSrc:path=>path,
        invoke:async(cmd,args={})=>{
          if(cmd==='plugin:event|listen'){handlers.set(args.event,args.handler);return args.handler;}
          if(cmd==='bootstrap')return {config:cfg,native:true,version:'0.9.0',warning:null,sessions:[],controller:'Xbox'};
          if(cmd==='save_config'){if(qa.failSave)throw Error('Save unavailable');qa.config=structuredClone(args.config);return qa.config;}
          if(cmd==='scan_apps'){
            qa.scanCount++;
            if(qa.mode==='fail')throw Error('Discovery unavailable');
            if(qa.mode==='empty')return [];
            const apps=[app('Netflix'),app('Spotify'),app('Steam'),app('Terminal','cmd.exe'),
              app('Plex','Plex.exe'),app('Plex','Plex HTPC.exe'),...Array.from({length:40},(_,i)=>app('Utility '+(i+1)))];
            return apps.map((a,i)=>({...a,id:'scan-'+qa.scanCount+'-'+i}));
          }
          if(cmd==='pick_application')return qa.file?app(qa.file):null;
          if(cmd==='audio_state')return {outputs:[],defaultId:null,volume:null,muted:false};return null;
        }};
    },config);
    await p.reload();await open(p);
    await p.getByText('Couldn’t finish finding apps.').waitFor();
    await p.evaluate(()=>window.pickerQA.mode='empty'); await button(p,'Try again').click(); await p.getByText('No apps found',{exact:true}).waitFor();
    await p.evaluate(()=>window.pickerQA.mode='apps');
    const refresh=async()=>{await button(p,'Discovery options').click();await button(p,'Refresh list').click();};
    await refresh(); await button(p,'Netflix').click();
    await refresh(); assert(await button(p,'Netflix').getAttribute('aria-pressed')==='true','A refresh with new IDs lost selection');
    await button(p,'Discovery options').click(); await p.getByLabel('Show system tools').check();
    await p.keyboard.press('Escape');await button(p,'Terminal').waitFor();
    await search(p).fill('Plex');assert(await p.locator('[data-app-row]').count()===2,'Same-name apps were merged');
    assert((await p.locator('[data-app-row]').allInnerTexts()).every(name=>name.includes('C:\\Apps')), 'Same-name targets are ambiguous');
    await search(p).fill('');await button(p,'Choose file…').click();
    assert(await button(p,'Add app').count()===1,'File dialog cancellation changed selection');
    await p.evaluate(()=>window.pickerQA.file='Portable');
    await button(p,'Choose file…').click();await button(p,'Add 2 apps').waitFor();
    await button(p,'Choose file…').click();await button(p,'Add 2 apps').waitFor();
    await button(p,'Steam').focus();
    const send = action=>p.evaluate(a=>window.pickerQA.emit(a),action);
    await send('accept');await send('right');assert(await button(p,'Add 3 apps').evaluate(el=>el===document.activeElement),'Controller cannot confirm a batch');
    await send('up');assert(await button(p,'Steam').evaluate(el=>el===document.activeElement),'Controller lost its row');
    await p.setViewportSize({width:1280,height:720}); await layout(p); await shot(p,'windows');
    await p.evaluate(()=>window.pickerQA.failSave=true);await button(p,'Add 3 apps').click();
    await p.getByText('Could not save your apps. Try again.').waitFor(); await button(p,'Add 3 apps').waitFor();
    await p.evaluate(()=>window.pickerQA.failSave=false);await button(p,'Add 3 apps').click();await dialog(p).waitFor({state:'hidden'});
    const saved=await p.evaluate(()=>window.pickerQA.config.apps.map(a=>a.name).sort());
    assert(saved.join(',')==='Netflix,Portable,Steam','Retry imported the wrong apps');
  } finally {await native.close();}
  assert(!errors.length,errors.join('\n'));
  return {passed:true,checks:['preview persistence and cancel','search stability, empty results and text entry','native scan failure, retry and empty state','system tools and duplicate names','refresh keeps selection','manual file and cancel','remote batch selection and focus','save rollback and retry','desktop, TV and mobile layout']};
}
