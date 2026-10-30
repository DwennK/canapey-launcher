// Isolated Chrome with simulated native IPC. No real TV or PC power actions.
async (page) => {
  await page.setViewportSize({width:1440,height:900});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
    const callbacks=new Map();let id=0;
    window.isTauri=true;
    const config={version:1,apps:[],selectedId:null,settings:{locale:'en',fullscreen:true,autostart:false,monitor:null,scale:1,motion:false,sound:false,soundVolume:.5,dynamicBackground:true,generalAmbiance:'home',backgroundBrightness:1,backgroundBlur:0,deadzone:.24,returnShortcut:'xbox',holdMs:1200,remoteHome:null,remoteBindings:[],appleRemote:{enabled:false,name:'Canapey',interface:null},library:{favorites:[],categories:{},sort:'custom'},lastSettingsTab:'tv'}};
    const tv={name:'Living room TV',ip:'192.168.1.20',mac:'02:11:22:33:44:55'};
    const state={available:true,tv:null,autoWake:false,autoStandby:false,waking:false,resumeAvailable:true,message:null,error:null};
    window.__tvQA={config,tv,state,calls:[],found:[],timeout:60,failSave:false,failWake:false,failPin:false};
    window.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener:()=>{}};
    window.__TAURI_INTERNALS__={transformCallback:fn=>{callbacks.set(++id,fn);return id;},unregisterCallback:i=>callbacks.delete(i),convertFileSrc:p=>p,invoke:async(cmd,args={})=>{
      const q=window.__tvQA;q.calls.push({cmd,args});
      if(cmd==='plugin:event|listen')return ++id;
      if(cmd==='bootstrap')return {config:structuredClone(q.config),native:true,version:'0.6.0',warning:null,sessions:[],controller:null};
      if(cmd==='save_config'){q.config=structuredClone(args.config);return q.config;}
      if(cmd==='list_monitors')return [];
      if(cmd==='audio_state')return {outputs:[],defaultId:null,volume:null,muted:false};
      if(cmd==='tv_status')return structuredClone(q.state);
      if(cmd==='tv_discover')return structuredClone(q.found);
      if(cmd==='tv_inspect'){if(args.ip==='192.168.1.99')throw 'This TV does not support Philips PIN pairing (jointSPACE v6).';return {...q.tv,mac:null};}
      if(cmd==='tv_pair')return {secondsRemaining:q.timeout,name:args.tv.name};
      if(cmd==='tv_pair_finish'){if(q.failPin)throw 'The TV rejected the code. Check it or request a new code.';q.state.tv=q.tv;q.state.autoWake=true;q.state.autoStandby=false;q.state.message='TV paired. Test the wake sequence before relying on automatic wake.';return structuredClone(q.state);}
      if(cmd==='tv_preferences'){if(q.failSave)throw 'Could not save the TV pairing.';q.state.autoWake=args.autoWake;q.state.autoStandby=args.autoStandby;return structuredClone(q.state);}
      if(cmd==='tv_standby'){q.state.message='The TV accepted the standby command.';return structuredClone(q.state);}
      if(cmd==='tv_wake'){if(q.failWake)throw 'The screen did not confirm it was on. Check the TV\'s network wake setting and try again.';q.state.message='The TV reports that its screen is on.';return structuredClone(q.state);}
      if(cmd==='tv_forget'){q.state.tv=null;q.state.autoWake=false;q.state.autoStandby=false;q.state.message=null;return structuredClone(q.state);}
      return null;
    }};
  });
  await page.reload();
  const assert=(value,msg)=>{if(!value)throw Error(msg)};
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.getByRole('button',{name:'Controls',exact:true}).click();
  await page.getByRole('button',{name:'TV',exact:true}).click();
  await page.getByRole('heading',{name:'Your TV and PC, together'}).waitFor();
  await page.waitForFunction(()=>!document.querySelector('.tv-settings .primary-button')?.disabled);
  await page.screenshot({path:'output/playwright/tv-desktop-setup.png'});
  await page.getByRole('button',{name:'Find my TV',exact:true}).click();
  await page.getByRole('heading',{name:'No compatible TV found yet'}).waitFor();
  assert(await page.getByRole('heading',{name:'No compatible TV found yet'}).evaluate(e=>document.activeElement===e),'Search results should receive focus');
  await page.getByText('My TV is not listed',{exact:true}).click();
  await page.getByLabel('TV IP address',{exact:true}).fill('192.168.1.99');
  await page.getByRole('button',{name:'Find this TV',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'does not support'}).waitFor();
  await page.getByLabel('TV IP address',{exact:true}).fill('192.168.1.20');
  await page.getByRole('button',{name:'Find this TV',exact:true}).click();
  await page.getByLabel('TV network MAC address',{exact:true}).waitFor();
  assert(await page.getByRole('button',{name:'Show code on TV',exact:true}).isDisabled(),'Missing MAC should block pairing');
  await page.getByLabel('TV network MAC address',{exact:true}).fill('02:11:22:33:44:55');
  await page.evaluate(()=>window.__tvQA.timeout=1);
  await page.getByRole('button',{name:'Show code on TV',exact:true}).click();
  await page.getByRole('button',{name:'Request a new code',exact:true}).waitFor();
  assert(await page.getByLabel('TV pairing code',{exact:true}).isDisabled(),'Expired PIN must be disabled');
  await page.evaluate(()=>window.__tvQA.timeout=60);
  await page.getByRole('button',{name:'Request a new code',exact:true}).click();
  await page.getByLabel('TV pairing code',{exact:true}).fill('0042');
  await page.evaluate(()=>window.__tvQA.failPin=true);
  await page.getByRole('button',{name:'Connect TV',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'rejected the code'}).waitFor();
  await page.evaluate(()=>window.__tvQA.failPin=false);
  await page.setViewportSize({width:390,height:844});
  await page.locator('.tv-code').scrollIntoViewIfNeeded();
  await page.screenshot({path:'output/playwright/tv-mobile-pin.png'});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=390),'Mobile horizontal overflow');
  await page.getByRole('button',{name:'Connect TV',exact:true}).click();
  await page.getByRole('button',{name:'Test TV wake',exact:true}).waitFor();
  assert(await page.evaluate(()=>window.__tvQA.calls.filter(c=>c.cmd==='tv_pair_finish').every(c=>c.args.pin==='0042')),'Leading zero lost');
  const resume=page.getByRole('switch',{name:/Turn on the TV automatically/});
  const off=page.getByRole('switch',{name:/Turn off the TV automatically/});
  assert(await resume.isChecked(),'Pairing should enable automatic wake');
  assert(!await off.isChecked(),'Pairing must not enable automatic standby');
  await off.check();
  assert(await off.isChecked(),'Standby preference did not persist');
  await page.getByRole('button',{name:'Turn off TV now',exact:true}).click();
  await page.getByRole('status').filter({hasText:'accepted the standby'}).waitFor();
  await page.evaluate(()=>window.__tvQA.failSave=true);
  await resume.click();
  await page.getByRole('alert').filter({hasText:'Could not save'}).waitFor();
  assert(await resume.isChecked(),'Failed save changed persisted switch');
  await page.evaluate(()=>window.__tvQA.failSave=false);
  await resume.uncheck();
  assert(!await resume.isChecked(),'Resume preference did not persist');
  await page.evaluate(()=>window.__tvQA.failWake=true);
  await page.getByRole('button',{name:'Test TV wake',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'screen did not confirm'}).waitFor();
  await page.evaluate(()=>window.__tvQA.failWake=false);
  await page.getByRole('button',{name:'Test TV wake',exact:true}).click();
  await page.getByRole('status').filter({hasText:'screen is on'}).waitFor();
  await page.setViewportSize({width:1440,height:900});
  await page.locator('.settings-content').evaluate(e=>e.scrollTop=0);
  await page.screenshot({path:'output/playwright/tv-desktop-paired.png'});
  await page.getByRole('button',{name:'Change TV',exact:true}).click();
  await page.evaluate(()=>window.__tvQA.found=[window.__tvQA.tv,{...window.__tvQA.tv,name:'Bedroom TV',ip:'192.168.1.21'}]);
  await page.getByRole('button',{name:'Find my TV',exact:true}).click();
  await page.getByRole('heading',{name:'Choose your TV',exact:true}).waitFor();
  await page.screenshot({path:'output/playwright/tv-desktop-results.png'});
  await page.getByRole('button',{name:/Bedroom TV/}).click();
  await page.getByRole('button',{name:'Show code on TV',exact:true}).click();
  await page.getByRole('button',{name:'Cancel pairing',exact:true}).click();
  await page.getByRole('button',{name:'Keep current TV',exact:true}).click();
  assert(await page.getByRole('heading',{name:'Living room TV',exact:true}).isVisible(),'Cancel replacement lost paired TV');
  await resume.check();
  await page.getByRole('button',{name:'Open startup settings',exact:true}).click();
  await page.getByRole('button',{name:'Controls',exact:true}).click();
  await page.getByRole('button',{name:'TV',exact:true}).click();
  assert(await resume.isChecked(),'Wake preference lost after remount');
  assert(await off.isChecked(),'Standby preference lost after remount');
  await off.uncheck();
  await page.setViewportSize({width:1440,height:900});
  await page.locator('.settings-content').evaluate(e=>e.scrollTop=0);
  await page.screenshot({path:'output/playwright/tv-desktop-defaults.png'});
  await page.setViewportSize({width:390,height:844});
  await page.locator('.settings-content').evaluate(e=>e.scrollTop=0);
  await page.screenshot({path:'output/playwright/tv-mobile-paired.png'});
  await page.getByText('Connection details and troubleshooting',{exact:true}).click();
  await page.getByRole('button',{name:'Forget this TV',exact:true}).click();
  await page.getByRole('button',{name:'Forget TV',exact:true}).click();
  await page.getByRole('button',{name:'Find my TV',exact:true}).waitFor();
  assert(await page.evaluate(()=>window.__tvQA.state.tv===null),'Forget did not clear TV');
  await page.evaluate(()=>window.__tvQA.state.available=false);
  await page.getByRole('button',{name:'Find my TV',exact:true}).waitFor();
  await page.waitForFunction(()=>document.querySelector('.tv-settings .primary-button')?.disabled===true);
  assert(!errors.length,errors.join('; '));
  return {passed:true,errors,viewports:['1440x900','390x844'],checks:['empty discovery','manual fallback','unsupported TV','missing MAC','PIN expiry/retry','leading-zero PIN','invalid PIN','save rollback','automatic wake on/standby off defaults','standby preference and button','wake failure/success','replacement cancellation','startup shortcut','remount persistence','forget','unsupported preview']};
}
