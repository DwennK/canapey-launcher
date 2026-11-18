// Run in an isolated Chrome session against the Vite preview with simulated Windows IPC.
async (page) => {
  const origin = page.url();
  const assert = (value, message) => { if (!value) throw Error(message); };
  for (const viewport of [{width:1440,height:900}, {width:390,height:844}]) {
    const context = await page.context().browser().newContext({viewport});
    try {
      const tab = await context.newPage();
      const errors = [];
      tab.on('pageerror', e => errors.push(e.message));
      await tab.goto(origin);
      const config = await tab.evaluate(async () => (await import('/src/lib/types.ts')).defaults());
      await tab.addInitScript(config => {
        const card = { id:'player', name:'My player', theme:'home', card:'/art/home-card.webp',
          background:'/art/home-bg.webp', icon:null, source:'QA',
          target:{ kind:'executable', value:'C:/Old/Player.exe', args:['--tv'], workingDir:'C:/Old' } };
        const moved = { ...card, id:'detected', name:'Player', target:{kind:'executable',value:'D:/Media/Player.exe',args:[],workingDir:'D:/Media'} };
        config.apps = [{ ...card, id:'other', name:'Other', target:{...card.target,value:'C:/Other.exe'} }, card];
        config.settings.library.favorites=['player']; config.settings.library.categories.player='video';
        config.settings.motion=false; config.settings.sound=false; config.selectedId='player';
        window.isTauri=true; let id=0;
        window.__repairQA={ saved:config, launches:0, failSave:false };
        window.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener(){}};
        window.__TAURI_INTERNALS__={transformCallback:()=>++id,unregisterCallback(){},convertFileSrc:p=>p,
          async invoke(cmd,args={}) {
            const qa=window.__repairQA;
            if(cmd==='bootstrap')return {config:structuredClone(qa.saved),native:true,version:'0.9.0',sessions:[],controller:null,warning:null};
            if(cmd==='save_config'){if(qa.failSave)throw 'Save failed';return qa.saved=structuredClone(args.config);}
            if(cmd==='launch_app'){qa.launches++;throw 'Application file not found.';}
            if(cmd==='scan_apps')return [moved];
            if(cmd==='pick_application')return moved;
            if(cmd==='check_replacement')return;
            if(cmd==='plugin:event|listen')return ++id;
            return null;
          }};
      },config);
      await tab.reload();
      const card=tab.locator('.app-card').filter({hasText:'My player'}).first();
      await card.click();
      const dialog=tab.getByRole('dialog',{name:'Locate application'});
      await dialog.getByRole('button',{name:'Find application'}).click();
      await dialog.getByRole('button',{name:'D:/Media/Player.exe'}).click();
      await dialog.getByRole('button',{name:'Cancel'}).click();
      assert((await tab.evaluate(()=>window.__repairQA.saved.apps[1].target.value))==='C:/Old/Player.exe','Cancel changed the target');
      await card.click({button:'right'});
      await tab.getByRole('button',{name:'Locate application'}).click();
      await dialog.getByRole('button',{name:'Choose a file…'}).click();
      const original=await tab.evaluate(()=>structuredClone(window.__repairQA.saved));
      await tab.evaluate(()=>window.__repairQA.failSave=true);
      await dialog.getByRole('button',{name:'Use this location'}).click();
      assert(await dialog.isVisible(),'Failed repair closed the dialog');
      await tab.evaluate(()=>window.__repairQA.failSave=false);
      await dialog.getByRole('button',{name:'Use this location'}).click();
      await dialog.waitFor({state:'hidden'});
      const result=await tab.evaluate(()=>window.__repairQA);
      original.apps[1].target.value='D:/Media/Player.exe'; original.apps[1].target.workingDir='D:/Media';
      assert(JSON.stringify(result.saved.apps)===JSON.stringify(original.apps),'Card metadata, arguments or order changed');
      assert(JSON.stringify(result.saved.settings.library)===JSON.stringify(original.settings.library),'Library preferences changed');
      assert(result.launches===1,'Repair launched an app');
      assert(!errors.length, errors.join('\n'));
    } finally { await context.close(); }
  }
  return 'Card repair passed on desktop and mobile';
}
