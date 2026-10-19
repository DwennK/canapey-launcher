// Production renderer only. The native receiver is simulated, not benchmarked.
async (page) => {
  const browser=page.context().browser(), samples=[];
  for(let round=0;round<8;round++) for(const enabled of round%2?[true,false]:[false,true]){
    const context=await browser.newContext({viewport:{width:1440,height:900}});
    try{
      await context.addInitScript(({enabled})=>{
        let next=0;window.isTauri=true;window.__appleStartup=null;
        const config={version:1,apps:[],selectedId:null,settings:{fullscreen:true,autostart:false,monitor:null,scale:1,motion:false,sound:false,soundVolume:.25,dynamicBackground:true,generalAmbiance:'home',backgroundBrightness:1,backgroundBlur:0,deadzone:.24,returnShortcut:'xbox',holdMs:1200,remoteHome:null,remoteBindings:[],appleRemote:{enabled,name:'Canapey — Salon',interface:null}}};
        window.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener:()=>{}};
        window.__TAURI_INTERNALS__={transformCallback:()=>++next,unregisterCallback:()=>{},convertFileSrc:p=>p,invoke:async(cmd,args={})=>{
          if(cmd==='bootstrap')return {config,native:true,version:'0.4.0',warning:null,sessions:[],controller:null};
          if(cmd==='plugin:event|listen')return args.handler;
          if(cmd==='frontend_painted'){window.__appleStartup={elapsed:performance.now(),timings:args.timings};return;}
          if(cmd==='audio_state')return {outputs:[],defaultId:null,volume:null,muted:false};
          return null;
        }};
      },{enabled});
      const p=await context.newPage();await p.goto('http://127.0.0.1:4178/');
      await p.waitForFunction(()=>window.__appleStartup!==null);
      samples.push({enabled,round,...await p.evaluate(()=>({elapsed:window.__appleStartup.elapsed,appleChunkLoaded:performance.getEntriesByType('resource').some(r=>r.name.includes('AppleRemoteSettings'))}))});
    } finally {await context.close();}
  }
  const median=values=>{values.sort((a,b)=>a-b);return (values[3]+values[4])/2;};
  return {scope:'Chrome renderer; mocked IPC; not native Windows service startup',samples,disabledMedianMs:median(samples.filter(s=>!s.enabled).map(s=>s.elapsed)),enabledMedianMs:median(samples.filter(s=>s.enabled).map(s=>s.elapsed)),lazyChunkAbsent:samples.every(s=>!s.appleChunkLoaded)};
}
