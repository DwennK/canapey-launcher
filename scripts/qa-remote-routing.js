// Repeatable full-remote UI/IPC fixture. Does not emit real Windows input.
async (page) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({width:1440,height:900});
  await page.addInitScript(() => {
    const callbacks = new Map(), events = new Map(); let next = 0;
    const initial = {version:1,apps:[{id:'spotify',name:'Spotify',theme:'spotify',target:{kind:'executable',value:'C:\\Spotify.exe',args:[],workingDir:null},card:null,background:null,icon:null,source:'QA'}],selectedId:'spotify',settings:{library:{favorites:[],categories:{},sort:'custom'},lastSettingsTab:'display',soundVolume:0.5,dynamicBackground:true,generalAmbiance:'home',backgroundBrightness:0.5,backgroundBlur:12,fullscreen:true,autostart:false,monitor:null,scale:1,motion:false,sound:false,deadzone:0.24,returnShortcut:'xbox',holdMs:1200,remoteHome:null,remoteBindings:[]}};
    window.isTauri = true;
    const config = JSON.parse(sessionStorage.getItem('remote-map-qa') || JSON.stringify(initial));
    window.__remoteQA = {config,calls:[],fail:false,emit(event,payload) { callbacks.get(events.get(event))?.({event,id:1,payload}); }};
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {unregisterListener:event=>events.delete(event)};
    window.__TAURI_INTERNALS__ = {
      transformCallback:fn=>{callbacks.set(++next,fn);return next;}, unregisterCallback:id=>callbacks.delete(id), convertFileSrc:p=>p,
      invoke:async(cmd,args={})=>{
        const qa=window.__remoteQA;qa.calls.push({cmd,args});
        if(cmd==='plugin:event|listen'){events.set(args.event,args.handler);return args.handler;}
        if(cmd==='bootstrap')return {config:structuredClone(qa.config),native:true,version:'0.6.0',warning:null,sessions:[],controller:null};
        if(cmd==='save_config'){if(qa.fail)throw Error('Raccourci déjà réservé par Windows.');qa.config=structuredClone(args.config);sessionStorage.setItem('remote-map-qa',JSON.stringify(qa.config));return structuredClone(qa.config);}
        if(cmd==='remote_home_status')return {available:true,active:qa.config.settings.remoteBindings.filter(b=>b.global),error:null};
        if(cmd==='launch_app')return {appId:args.id,name:'Spotify',status:'running',canForce:false};
        if(cmd==='close_app' && qa.closeFail)throw Error('Fermeture refusée pour le test.');
        if(cmd==='audio_state')return {outputs:[],defaultId:null,volume:null,muted:false};
        if(cmd==='list_monitors')return [];
        if(cmd==='check_update')return {state:'disabled'};
        return null;
      }
    };
  });
  await page.reload();
  await page.evaluate(()=>sessionStorage.removeItem('remote-map-qa'));
  await page.reload();
  const assert=(v,m)=>{if(!v)throw Error(m);};
  const send = async (pressed, cancelled = false) => page.evaluate(({pressed,cancelled}) => window.__remoteQA.emit('remote-action', {binding:{button:'ok',key:{code:'Enter',ctrl:false,alt:false,shift:false},action:'accept',global:true,appId:null},pressed,cancelled}), {pressed,cancelled});
  const count = () => page.evaluate(() => window.__remoteQA.calls.filter(c=>c.cmd==='launch_app').length);
  await page.locator('.app-card').first().focus();
  const before = await count();
  await send(true); await send(true); await send(false, true);
  await page.waitForTimeout(1300);
  assert(await count() === before, 'Cancelled OK launched an application');
  assert(!await page.getByRole('button',{name:"Edit",exact:true}).isVisible(), 'Cancelled OK opened long-press options');
  await page.locator('.app-card').first().focus();
  await send(true); await send(true); await send(false); await send(false);
  await page.waitForTimeout(200);
  assert(await count() === before + 1, 'Short OK did not validate exactly once');
  await page.locator('.app-card').first().focus();
  await send(true);
  await page.getByRole('button',{name:"Edit",exact:true}).waitFor();
  await send(false);
  assert(await count() === before + 1, 'Long OK also launched the application');
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:"Settings",exact:true}).click();
  await page.getByRole('button',{name:"Controls",exact:true}).click();
  await page.getByRole('button',{name:"Remote",exact:true}).click();
  await page.locator('.remote-inspector').waitFor();
  await page.getByRole('combobox',{name:"Button",exact:true}).selectOption('ok');
  await page.getByText("Controls the active app: OK sends Enter, Back sends Escape. Only Home returns to Canapey.",{exact:true}).waitFor();
  await page.getByRole('button',{name:"Cancel listening",exact:true}).click();
  await send(true); await send(false);
  assert(await count() === before + 1, 'Remote editor executed OK');
  await page.getByRole('switch',{name:/Enable throughout Windows/}).scrollIntoViewIfNeeded();
  await page.screenshot({path:'output/playwright/remote-routing-desktop.png'});
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('switch',{name:/Enable throughout Windows/}).scrollIntoViewIfNeeded();
  await page.screenshot({path:'output/playwright/remote-routing-mobile.png'});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth), 'Mobile horizontal overflow');
  assert(errors.length === 0, errors.join('\n'));
  return {ok:true,errors,launches:await count()};
}
