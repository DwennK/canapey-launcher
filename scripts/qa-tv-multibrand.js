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
      if(cmd==='bootstrap')return {config:structuredClone(q.config),native:true,version:'0.7.1',warning:null,sessions:[],controller:null};
      if(cmd==='save_config'){q.config=structuredClone(args.config);return q.config;}
      if(cmd==='list_monitors')return [];
      if(cmd==='audio_state')return {outputs:[],defaultId:null,volume:null,muted:false};
      if(cmd==='tv_status')return structuredClone(q.state);
      if(cmd==='tv_discover')return structuredClone(q.found);
      if(cmd==='tv_inspect'){if(args.ip==='192.168.1.99')throw 'This TV does not support Philips PIN pairing (jointSPACE v6).';return {...q.tv,mac:null};}
      if(cmd==='tv_pair'){q.selected=args.tv;return {secondsRemaining:120,name:args.tv.name};}
      if(cmd==='tv_cancel_pairing'){q.reject?.('Pairing cancelled.');q.reject=null;return null;}
      if(cmd==='tv_pair_finish'){if(q.waitApproval)await new Promise((resolve,reject)=>{q.approve=resolve;q.reject=reject;});if(q.failPin)throw 'The TV rejected the code. Check it or request a new code.';q.state.tv=q.selected;q.state.autoWake=true;q.state.autoStandby=false;q.state.message='TV paired. Test the wake sequence before relying on automatic wake.';return structuredClone(q.state);}
      if(cmd==='tv_hdmi_ports')return [1,2,4];
      if(cmd==='tv_set_hdmi'){if(q.failSave)throw 'Could not save the TV pairing.';q.state.hdmiPort=args.port;return structuredClone(q.state);}
      if(cmd==='tv_preferences'){if(q.failSave)throw 'Could not save the TV pairing.';q.state.autoWake=args.autoWake;q.state.autoStandby=args.autoStandby;return structuredClone(q.state);}
      if(cmd==='tv_standby'){q.state.message='TV standby requested. Check the TV screen.';return structuredClone(q.state);}
      if(cmd==='tv_retry_input'){
        if(args.mac!==q.state.tv.mac || args.port!==q.state.hdmiPort)throw 'Wrong TV or port';
        Object.assign(q.state.wakeProgress,{inputSent:true,retryInput:false}); q.state.error=null;
        return structuredClone(q.state);
      }
      if(cmd==='tv_wake'){if(q.failHdmi){
        q.state.wakeProgress={packetSent:true,reachable:true,powerConfirmed:true,inputSent:false,retryInput:true};
        q.state.error='The TV is on, but the HDMI switch failed. Check the input and TV permissions.';
        throw q.state.error;
      }if(q.failWake)throw 'The TV did not confirm it was on. Check the TV\'s network wake setting and try again.';q.state.message='The TV reports that it is on. Check the picture on its screen.';return structuredClone(q.state);}
      if(cmd==='tv_forget'){q.state.tv=null;q.state.autoWake=false;q.state.autoStandby=false;q.state.message=null;return structuredClone(q.state);}
      return null;
    }};
  });
  await page.reload();
  const assert=(value,msg)=>{if(!value)throw Error(msg)};
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.getByRole('button',{name:'Controls',exact:true}).click();
  await page.getByRole('button',{name:'TV',exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector('.tv-settings .primary-button')?.disabled);
  await page.evaluate(()=>window.__tvQA.found=['lgWebos','samsungTizen','sonyBravia','roku'].map((protocol,i)=>({...window.__tvQA.tv,name:['LG living room','Samsung bedroom','Sony cinema','TCL Roku TV'][i],ip:`192.168.1.${30+i}`,protocol,secure:protocol!=='roku'})));
  await page.getByRole('button',{name:'Find my TV',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.tv-result')?.disabled===false);
  await page.screenshot({path:'output/playwright/tv-multibrand-desktop.png'});
  for(const [index,name] of ['LG living room','Samsung bedroom','Sony cinema','TCL Roku TV'].entries()) {
    if(index>0){
      await page.getByRole('button',{name:'Change TV',exact:true}).click();
      await page.getByRole('button',{name:'Find my TV',exact:true}).click();
    }
    await page.getByRole('button',{name:new RegExp(name)}).click();
    await page.getByRole('button',{name:'Continue',exact:true}).click();
    assert(await page.getByLabel('TV pairing code',{exact:true}).count()===0,'Non-Philips TV asks for a PIN');
    if(index===2){
      const key=page.getByLabel('TV pre-shared key',{exact:true});
      assert(await key.getAttribute('type')==='password','Sony key is exposed as plain text');
      assert(await page.getByRole('button',{name:'Connect TV',exact:true}).isDisabled(),'Empty Sony key accepted');
      await key.fill('synthetic-key');
      await page.setViewportSize({width:390,height:844});
      await page.locator('.tv-code').scrollIntoViewIfNeeded();
      await page.screenshot({path:'output/playwright/tv-multibrand-mobile-key.png'});
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=390),'Mobile horizontal overflow');
    }
    if(index===0){
      await page.evaluate(()=>window.__tvQA.waitApproval=true);
      await page.getByRole('button',{name:'Connect TV',exact:true}).click();
      await page.getByText('Waiting for permission on the TV…',{exact:true}).waitFor();
      await page.getByRole('button',{name:'Cancel pairing',exact:true}).click();
      await page.getByRole('button',{name:'Continue',exact:true}).waitFor();
      assert(await page.evaluate(()=>window.__tvQA.state.tv===null),'Cancelled request saved a TV');
      await page.evaluate(()=>window.__tvQA.waitApproval=false);
      await page.getByRole('button',{name:'Continue',exact:true}).click();
    }
    await page.getByRole('button',{name:'Connect TV',exact:true}).click();
    await page.getByRole('button',{name:'Test TV wake',exact:true}).waitFor();
    assert(await page.getByRole('switch',{name:/Turn on the TV automatically/}).isChecked(),'Wake default lost');
    assert(!await page.getByRole('switch',{name:/Turn off the TV automatically/}).isChecked(),'Standby implicitly enabled');
    assert(await page.getByRole('heading',{name,exact:true}).isVisible(),'Wrong paired TV');
    const scan = page.getByRole('button',{name:'Find HDMI inputs'});
    if(index === 1) {
      assert(await scan.count()===0,'Samsung has no discrete HDMI adapter');
    } else {
      await scan.click();
      const select = page.getByRole('combobox',{name:/PC HDMI input/});
      await select.selectOption('2');
      await page.evaluate(()=>window.__tvQA.failHdmi=true);
      await page.getByRole('button',{name:'Wake TV and switch to HDMI 2'}).click();
      const progress=page.getByRole('region',{name:'Last wake attempt'});
      await progress.getByRole('button',{name:'Retry HDMI input'}).waitFor();
      assert(await progress.getByText('Done',{exact:true}).count()===3,'Incorrect confirmed wake steps');
      const wakes=await page.evaluate(()=>window.__tvQA.calls.filter(c=>c.cmd==='tv_wake').length);
      await progress.getByRole('button',{name:'Retry HDMI input'}).click();
      await page.waitForFunction(()=>!document.querySelector('.wake-progress button'));
      assert(await progress.getByText('Done',{exact:true}).count()===4,'HDMI retry not confirmed');
      assert(wakes===await page.evaluate(()=>window.__tvQA.calls.filter(c=>c.cmd==='tv_wake').length),'HDMI retry repeated wake');
      await page.evaluate(()=>window.__tvQA.failHdmi=false);
      await page.evaluate(()=>window.__tvQA.failSave=true);
      await select.selectOption('4');
      await page.getByRole('alert').filter({hasText:'Could not save'}).waitFor();
      assert(await select.inputValue()==='2','Failed save lost the previous HDMI preference');
      await page.evaluate(()=>window.__tvQA.failSave=false);
      await select.selectOption('0');
      await page.getByRole('button',{name:'Test TV wake',exact:true}).waitFor();
    }
  }
  await page.screenshot({path:'output/playwright/tv-multibrand-mobile-paired.png'});
  assert(!errors.length,errors.join('; '));
  return {passed:true,errors,families:['LG webOS','Samsung Tizen','Sony BRAVIA','Roku TV'],checks:['discovery','authorization flows','cancel pending approval','secret input','wake and standby defaults'],viewports:['1440x900','390x844']};
}
