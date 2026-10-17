// Repeatable full-remote UI/IPC fixture. Does not emit real Windows input.
async (page) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({width:1440,height:900});
  await page.addInitScript(() => {
    const callbacks = new Map(), events = new Map(); let next = 0;
    const initial = {version:1,apps:[{id:'spotify',name:'Spotify',theme:'spotify',target:{kind:'executable',value:'C:\\Spotify.exe',args:[],workingDir:null},card:null,background:null,icon:null,source:'QA'}],selectedId:'spotify',settings:{fullscreen:true,autostart:false,monitor:null,scale:1,motion:false,sound:false,deadzone:0.24,returnShortcut:'xbox',holdMs:1200,remoteHome:null,remoteBindings:[]}};
    window.isTauri = true;
    const config = JSON.parse(sessionStorage.getItem('remote-map-qa') || JSON.stringify(initial));
    window.__remoteQA = {config,calls:[],fail:false,emit(event,payload) { callbacks.get(events.get(event))?.({event,id:1,payload}); }};
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {unregisterListener:event=>events.delete(event)};
    window.__TAURI_INTERNALS__ = {
      transformCallback:fn=>{callbacks.set(++next,fn);return next;}, unregisterCallback:id=>callbacks.delete(id), convertFileSrc:p=>p,
      invoke:async(cmd,args={})=>{
        const qa=window.__remoteQA;qa.calls.push({cmd,args});
        if(cmd==='plugin:event|listen'){events.set(args.event,args.handler);return args.handler;}
        if(cmd==='bootstrap')return {config:structuredClone(qa.config),native:true,version:'0.2.0',warning:null,sessions:[],controller:null};
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
  const open=async()=>{await page.getByRole('button',{name:'Paramètres',exact:true}).click();await page.getByRole('button',{name:'Télécommande',exact:true}).click();await page.locator('.remote-photo img').waitFor();};
  const choose=async(name)=>{await page.getByRole('button',{name:`Configurer ${name}`,exact:true}).click();};
  const learn=async(name,key)=>{await choose(name);if(!await page.getByText('À l’écoute…',{exact:true}).isVisible())await page.getByRole('button',{name:/^(Réapprendre|Apprendre) la touche$/}).click();await page.getByText('À l’écoute…',{exact:true}).waitFor();await page.keyboard.press(key);await page.getByText('Touche reçue. Choisissez son action et enregistrez.',{exact:true}).waitFor();};
  const save=async()=>{await page.getByRole('button',{name:'Enregistrer',exact:true}).click();await page.getByText('Association enregistrée.',{exact:true}).waitFor();};
  const bindings=()=>page.evaluate(()=>window.__remoteQA.config.settings.remoteBindings);
  await open();
  assert(await page.locator('.remote-hotspot').count()===34,'Missing physical buttons');
  const photo=await page.locator('.remote-photo').boundingBox();assert(Math.abs(photo.width/photo.height-240/920)<.01,'Photo/hotspot aspect ratio is distorted');
  await page.screenshot({path:'output/playwright/remote-full-desktop.png'});
  await choose('Activité A');
  await page.getByText(/Le bouton A sélectionne une activité/).waitFor();
  assert(!await page.getByRole('button',{name:'Enregistrer',exact:true}).isVisible(),'Activity pretends to be an IR command');
  await learn('Home','Control+Alt+h');await save();
  await learn('Haut','ArrowUp');await save();
  await learn('Retour','Escape');await save();
  await learn('1','n');
  await page.getByRole('combobox',{name:'Application',exact:true}).selectOption('spotify');
  await page.getByRole('switch',{name:/Activer dans tout Windows/}).uncheck();await save();
  await learn('Volume +','Control+Alt+v');await save();
  // Local arbitrary mapping must route to an action, not just be stored.
  await learn('Informations','l');await page.getByRole('combobox',{name:'Action',exact:true}).selectOption('library');await save();
  await learn('2','Control+Alt+h');await page.getByRole('alert').filter({hasText:'Touche déjà associée'}).waitFor();
  assert(await page.getByRole('button',{name:'Enregistrer',exact:true}).isDisabled(),'Duplicate signal was accepted');
  // Replacement conflict leaves all previous bindings untouched.
  await learn('Home','Control+Alt+g');await page.evaluate(()=>window.__remoteQA.fail=true);
  await page.getByRole('button',{name:'Enregistrer',exact:true}).click();
  await page.getByText(/Enregistrement impossible/).waitFor();
  assert((await bindings()).find(b=>b.button==='home').key.code==='KeyH','Conflict replaced original Home');
  await page.evaluate(()=>window.__remoteQA.fail=false);
  await page.getByRole('button',{name:'Enregistrer',exact:true}).click();await page.getByText('Association enregistrée.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Réapprendre la touche',exact:true}).click();
  await page.evaluate(()=>window.__remoteQA.emit('remote-home-captured',window.__remoteQA.config.settings.remoteBindings.find(b=>b.button==='home').key));
  await page.getByText('Touche reçue. Choisissez son action et enregistrez.',{exact:true}).waitFor();
  // Ring has four separately addressable color buttons.
  await page.getByRole('button',{name:'Couleurs',exact:true}).click();
  await learn('Rouge','Control+Alt+r');await page.getByRole('combobox',{name:'Application',exact:true}).selectOption('spotify');await save();
  await page.reload();await open();
  assert((await bindings()).length===7,'Mappings lost after reload');
  await page.getByRole('button',{name:'Couleurs',exact:true}).click();await choose('Rouge');
  assert(await page.getByRole('combobox',{name:'Application',exact:true}).inputValue()==='spotify','Application target lost');
  await page.screenshot({path:'output/playwright/remote-full-configured.png'});
  await learn('3','ArrowDown');
  await page.getByRole('combobox',{name:'Application',exact:true}).selectOption('spotify');await save();
  assert((await bindings()).find(b=>b.button==='digit3').global,'Ordinary arrow was not global');
  await page.getByRole('button',{name:'Réapprendre la touche',exact:true}).click();await page.getByRole('button',{name:'Annuler l’écoute',exact:true}).click();
  await page.getByText(/Écoute arrêtée/).waitFor();
  await page.getByRole('button',{name:'Réapprendre la touche',exact:true}).click();await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.getByText(/Écoute interrompue/).waitFor();
  await page.getByRole('button',{name:'Réapprendre la touche',exact:true}).click();await page.clock.install();await page.clock.fastForward(16000);await page.getByText(/Aucune touche reçue/).waitFor();await page.clock.resume();
  await page.getByRole('button',{name:'Réapprendre la touche',exact:true}).click();
  await page.getByRole('button',{name:'Écran & démarrage',exact:true}).click();
  await page.getByRole('button',{name:'Télécommande',exact:true}).click();
  assert(!await page.getByText('À l’écoute…',{exact:true}).isVisible(),'Capture survived unmount');
  const nativeAction=async(button,pressed=true,foregrounded=true)=>page.evaluate(({button,pressed,foregrounded})=>window.__remoteQA.emit('remote-action',{binding:window.__remoteQA.config.settings.remoteBindings.find(b=>b.button===button),pressed,foregrounded}),{button,pressed,foregrounded});
  await nativeAction('info',true,false);
  assert(await page.locator('.remote-photo').isVisible(),'Focused editor executed a global interface action');
  // Test immediately after configuring: restoring from another app must exit the editor.
  await nativeAction('info');await page.locator('main.grid-mode').waitFor();
  await page.locator('.remote-photo').waitFor({state:'hidden'});
  await nativeAction('up');
  // Every interface action is delivered by the native event, without DOM keydown.
  await page.evaluate(()=>window.__remoteQA.emit('remote-action',{binding:{button:'menu',key:{code:'KeyM',ctrl:false,alt:false,shift:false},action:'menu',global:true,appId:null},pressed:true,foregrounded:true}));
  await page.getByRole('button',{name:'Écran & démarrage',exact:true}).waitFor();
  await page.getByRole('button',{name:'Fermer',exact:true}).click();
  await page.keyboard.press('n');assert(await page.evaluate(()=>window.__remoteQA.calls.some(c=>c.cmd==='run_remote_action'&&c.args.button==='digit1')),'Application mapping did not dispatch');
  const sendUI=async(action,pressed=true)=>page.evaluate(({action,pressed})=>window.__remoteQA.emit('remote-action',{binding:{button:'ok',key:{code:'Enter',ctrl:false,alt:false,shift:false},action,global:true,appId:null},pressed,foregrounded:true}),{action,pressed});
  await page.getByRole('button',{name:'Canapey — Accueil'}).click();
  await sendUI('accept');await page.getByRole('button',{name:'Modifier',exact:true}).waitFor();
  const launchCount=await page.evaluate(()=>window.__remoteQA.calls.filter(c=>c.cmd==='launch_app').length);
  await sendUI('accept',false);
  assert(await page.evaluate(()=>window.__remoteQA.calls.filter(c=>c.cmd==='launch_app').length)===launchCount,'Long native accept launched app');
  await sendUI('back');await page.getByRole('button',{name:'Modifier',exact:true}).waitFor({state:'hidden'});
  await sendUI('audio');await page.locator('.audio-panel').waitFor();await sendUI('back');
  await sendUI('power');await page.getByRole('button',{name:'Quitter le launcher',exact:true}).waitFor();await sendUI('back');
  await page.getByRole('button',{name:'Quitter le launcher',exact:true}).waitFor({state:'hidden'});
  await sendUI('accept');await sendUI('accept',false);
  await page.waitForFunction(()=>window.__remoteQA.calls.some(c=>c.cmd==='launch_app'));
  // Closing a running app dismisses its menu only after a successful request.
  await sendUI('options');await page.getByRole('button',{name:'Fermer normalement',exact:true}).waitFor();
  await page.evaluate(()=>window.__remoteQA.closeFail=true);
  await page.getByRole('button',{name:'Fermer normalement',exact:true}).click();
  await page.getByText('Fermeture refusée pour le test.',{exact:true}).waitFor();
  assert(await page.getByRole('button',{name:'Modifier',exact:true}).isVisible(),'Failed close dismissed the menu');
  await page.evaluate(()=>window.__remoteQA.closeFail=false);
  await page.getByRole('button',{name:'Fermer normalement',exact:true}).click();
  await page.getByRole('button',{name:'Modifier',exact:true}).waitFor({state:'hidden'});
  assert(await page.evaluate(()=>document.activeElement?.matches('.app-card')),'Quick-menu close did not restore card focus');
  // The secondary session menu must close too, even if the session still exists.
  await page.evaluate(()=>window.__remoteQA.emit('sessions',[{appId:'spotify',name:'Spotify',status:'closing',canForce:false}]));
  await sendUI('accept');await sendUI('accept',false);
  await page.getByRole('button',{name:'Fermer normalement',exact:true}).click();
  await page.getByRole('button',{name:'Fermer normalement',exact:true}).waitFor({state:'hidden'});
  await page.getByRole('button',{name:'Paramètres',exact:true}).click();
  await page.getByRole('button',{name:'Diagnostic',exact:true}).click();
  await page.locator('.session-detail').getByRole('button',{name:'Fermer',exact:true}).click();
  assert(await page.locator('.session-detail').isVisible(),'Diagnostic panel was dismissed when closing a session');
  await page.getByRole('button',{name:'Fermer',exact:true}).first().click();
  await open();await choose('Home');await page.getByRole('button',{name:'Retirer l’association',exact:true}).click();await page.getByText('Association retirée.',{exact:true}).waitFor();
  assert((await bindings()).length===7 && !(await bindings()).some(b=>b.button==='home'),'Removal affected other mappings');
  await learn('4','F8');await page.getByRole('combobox',{name:'Action',exact:true}).selectOption({label:'Vue des tâches (Windows + Tab)'});await save();
  await learn('5','F9');await page.getByRole('combobox',{name:'Action',exact:true}).selectOption({label:'Fermer la fenêtre active'});await save();
  await learn('6','F7');await page.getByRole('combobox',{name:'Action',exact:true}).selectOption({label:'Échap (Escape)'});await save();
  await page.reload();await open();
  for(const [button,action] of [['digit4','taskView'],['digit5','closeWindow'],['digit6','escape']])assert((await bindings()).some(b=>b.button===button&&b.action===action&&b.global),'Windows action was not persisted globally');
  await choose('4');await page.screenshot({path:'output/playwright/remote-windows-actions-desktop.png'});
  await page.setViewportSize({width:390,height:844});
  await page.locator('.remote-heading').scrollIntoViewIfNeeded();await page.screenshot({path:'output/playwright/remote-full-mobile-photo.png'});
  await choose('Lecture / pause');await page.keyboard.press('MediaPlayPause');
  await page.getByRole('combobox',{name:'Action',exact:true}).scrollIntoViewIfNeeded();await save();
  await page.screenshot({path:'output/playwright/remote-full-mobile-editor.png'});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile page overflow');
  assert(await page.locator('.settings-content').evaluate(e=>e.scrollWidth<=e.clientWidth+1),'Mobile content overflow');
  assert(errors.length===0,errors.join('\n'));
  return {passed:true,mappings:(await bindings()).length,errors,scope:'Chrome UI + simulated native IPC; physical Windows/Flirc not tested'};
}
