// Real Chrome UI, simulated Tauri IPC. Does not prove iPhone/Windows behavior.
async (page) => {
  await page.setViewportSize({width:1440,height:900});
  const errors=[]; page.on('pageerror', e=>errors.push(e.message));
  await page.addInitScript(()=>{
    const callbacks=new Map(),events=new Map();let next=0;
    window.isTauri=true;
    const config={version:1,apps:[],selectedId:null,settings:{fullscreen:true,autostart:false,monitor:null,scale:1,motion:false,sound:false,soundVolume:.25,dynamicBackground:true,generalAmbiance:'home',backgroundBrightness:1,backgroundBlur:0,deadzone:.24,returnShortcut:'xbox',holdMs:1200,remoteHome:null,remoteBindings:[],appleRemote:{enabled:false,name:'Canapey — Salon',interface:null}}};
    config.apps=[{id:'spotify',name:'Spotify',theme:'spotify',target:{kind:'executable',value:'C:\\Spotify.exe',args:[],workingDir:null},card:null,background:null,icon:null,source:'QA'}];
    config.selectedId='spotify';
    const state={available:true,running:false,networks:[],address:null,error:null,pairing:{pin:null,secondsRemaining:0,devices:[]}};
    window.__appleQA={config,state,calls:[],fail:false,emit(name,payload){callbacks.get(events.get(name))?.({event:name,id:1,payload});}};
    window.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener:event=>events.delete(event)};
    window.__TAURI_INTERNALS__={transformCallback:fn=>{callbacks.set(++next,fn);return next;},unregisterCallback:id=>callbacks.delete(id),convertFileSrc:p=>p,invoke:async(cmd,args={})=>{
      const qa=window.__appleQA;qa.calls.push({cmd,args});
      if(cmd==='plugin:event|listen'){events.set(args.event,args.handler);return args.handler;}
      if(cmd==='bootstrap')return {config:structuredClone(qa.config),native:true,version:'0.4.0',warning:null,sessions:[],controller:null};
      if(cmd==='launch_app')return {appId:args.id,name:'Spotify',status:'running',canForce:false};
      if(cmd==='save_config'){
        if(qa.fail)throw Error('Écriture refusée pour le test.');qa.config=structuredClone(args.config);
        qa.state.running=qa.config.settings.appleRemote.enabled;
        qa.state.networks=qa.state.running?[{id:'wifi/192.168.1.20',label:'Wi-Fi',address:'192.168.1.20'}]:[];
        qa.state.address=qa.state.running?'192.168.1.20:49200':null;
        if(!qa.state.running){qa.state.pairing.pin=null;qa.state.pairing.secondsRemaining=0;}
        return structuredClone(qa.config);
      }
      if(cmd==='apple_remote_status')return structuredClone(qa.state);
      if(cmd==='apple_remote_pair'){qa.state.pairing.pin='0437';qa.state.pairing.secondsRemaining=120;return;}
      if(cmd==='apple_remote_cancel_pairing'){qa.state.pairing.pin=null;qa.state.pairing.secondsRemaining=0;return;}
      if(cmd==='apple_remote_forget'){qa.state.pairing.devices=qa.state.pairing.devices.filter(d=>d.id!==args.id);return;}
      if(cmd==='remote_home_status')return {available:true,active:[],error:null};
      if(cmd==='audio_state')return {outputs:[],defaultId:null,volume:null,muted:false};
      if(cmd==='list_monitors')return [];
      if(cmd==='check_update')return {state:'disabled'};
      return null;
    }};
  });
  await page.reload();
  const assert=(ok,msg)=>{if(!ok)throw Error(msg);};
  await page.getByRole('button',{name:'Spotify',exact:true}).focus();
  const input=(action,connection=1)=>page.evaluate(({action,connection})=>window.__appleQA.emit('apple-input',{action,connection}),{action,connection});
  const launches=()=>page.evaluate(()=>window.__appleQA.calls.filter(c=>c.cmd==='launch_app').length);
  await input('accept-down');await input('accept-cancel');await input('accept-up');
  assert(await launches()===0,'Disconnect released accept as a launch');
  await input('accept-down');await input('accept-up',2);
  assert(await launches()===0,'Another connection released the held button');
  await input('accept-up');
  await page.waitForFunction(()=>window.__appleQA.calls.filter(c=>c.cmd==='launch_app').length===1);
  await input('accept-up');
  assert(await launches()===1,'Duplicate release launched twice');
  await page.getByRole('button',{name:'Paramètres',exact:true}).click();
  await page.getByRole('button',{name:'Télécommande',exact:true}).click();
  await page.getByRole('button',{name:'iPhone',exact:true}).click();
  const toggle=page.getByRole('switch',{name:/Activer la télécommande iPhone/});
  assert(!await toggle.isChecked(),'Enabled by default');
  await toggle.check();
  await page.getByRole('button',{name:'Associer un iPhone',exact:true}).waitFor();
  await page.getByRole('button',{name:'Associer un iPhone',exact:true}).click();
  await page.getByLabel('Code d’association').waitFor();
  assert(await page.getByLabel('Code d’association').textContent()==='0437','PIN lost leading zero');
  await page.locator('.settings-content').evaluate(e=>e.scrollTop=0);
  const cancelBounds=await page.getByRole('button',{name:'Annuler l’association',exact:true}).boundingBox();
  const contentBounds=await page.locator('.settings-content').boundingBox();
  assert(cancelBounds.y+cancelBounds.height<=contentBounds.y+contentBounds.height,'Pair cancellation below desktop fold');
  await page.screenshot({path:'output/playwright/apple-remote-desktop.png'});
  await page.getByRole('button',{name:'Annuler l’association',exact:true}).click();
  await page.getByLabel('Code d’association').waitFor({state:'hidden'});
  await page.getByText('Nom et réseau',{exact:true}).click();
  await page.getByLabel('Nom affiché sur l’iPhone').fill('Canapey — Chambre');
  await page.getByRole('combobox',{name:'Réseau privé'}).selectOption('wifi/192.168.1.20');
  await page.getByRole('button',{name:'Enregistrer les réglages',exact:true}).click();
  assert(await page.evaluate(()=>window.__appleQA.config.settings.appleRemote.name)==='Canapey — Chambre','Name not saved');
  await page.getByRole('button',{name:'Associer un iPhone',exact:true}).click();
  await page.evaluate(()=>{const qa=window.__appleQA;qa.state.pairing={pin:null,secondsRemaining:0,devices:[{id:'test-iphone-00000000',connected:true}]};qa.emit('apple-remote-status',qa.state);});
  await page.getByRole('button',{name:'Dissocier l’appareil 1'}).waitFor();
  await page.getByRole('button',{name:'Dissocier l’appareil 1'}).click();
  await page.getByRole('button',{name:'Dissocier l’appareil 1'}).waitFor({state:'hidden'});
  await page.evaluate(()=>{const qa=window.__appleQA;qa.state.running=false;qa.state.error='Aucun réseau privé IPv4 disponible.';qa.emit('apple-remote-status',qa.state);});
  await page.getByRole('alert').filter({hasText:'Aucun réseau privé'}).waitFor();
  assert(await page.getByRole('button',{name:'Associer un iPhone',exact:true}).isDisabled(),'Pair enabled without network');
  await page.getByText('Mon iPhone ne trouve pas Canapey',{exact:true}).click();
  await page.getByText(/Dans le pare-feu Windows/).waitFor();
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'output/playwright/apple-remote-mobile-error.png'});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Horizontal mobile overflow');
  await page.evaluate(()=>{const qa=window.__appleQA;qa.state.running=true;qa.state.error=null;qa.emit('apple-remote-status',qa.state);});
  await page.getByRole('button',{name:'Associer un iPhone',exact:true}).click();
  await page.getByLabel('Code d’association').waitFor();
  await page.locator('.apple-pair-card').scrollIntoViewIfNeeded();
  await page.screenshot({path:'output/playwright/apple-remote-mobile-pairing.png'});
  await page.evaluate(()=>{const qa=window.__appleQA;qa.state.pairing.pin=null;qa.state.pairing.secondsRemaining=0;qa.emit('apple-remote-status',qa.state);});
  await page.getByLabel('Code d’association').waitFor({state:'hidden'});
  await page.getByRole('button',{name:'Associer un iPhone',exact:true}).click();
  await page.getByLabel('Code d’association').waitFor();
  await page.getByRole('button',{name:'Skip 1s / Flirc',exact:true}).click();
  assert(await page.evaluate(()=>window.__appleQA.calls.filter(c=>c.cmd==='apple_remote_cancel_pairing').length)>=2,'Pairing not cancelled on leaving');
  await page.getByRole('button',{name:'iPhone',exact:true}).click();
  await page.setViewportSize({width:1440,height:900});
  await toggle.uncheck();
  assert(!await toggle.isChecked(),'Disable did not persist');
  await page.evaluate(()=>window.__appleQA.fail=true);
  await toggle.click();
  await page.getByRole('alert').filter({hasText:'Les réglages'}).waitFor();
  assert(!await toggle.isChecked(),'Save error did not restore previous settings');
  await page.evaluate(()=>{const qa=window.__appleQA;qa.state.available=false;qa.emit('apple-remote-status',qa.state);});
  await page.getByRole('status').filter({hasText:'Disponible sous Windows'}).waitFor();
  assert(await toggle.isDisabled(),'Non-Windows native app can enable receiver');
  assert(!errors.length,errors.join('; '));
  return {passed:true,consoleErrors:errors,screenshots:['apple-remote-desktop.png','apple-remote-mobile-error.png','apple-remote-mobile-pairing.png']};
}
