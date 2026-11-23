// Playwright CLI run-code --filename scripts/qa-website.js.
// System Chrome, isolated context; Windows dialogs and launches are IPC fixtures.
async (page) => {
  const origin = page.url(), browser = page.context().browser();
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const errors = [];
  const context = await browser.newContext({viewport:{width:1440,height:900}});
  try {
    const p = await context.newPage();
    p.setDefaultTimeout(8000);
    p.on('pageerror', e => errors.push(e.message));
    await p.goto(origin);
    const initial = await p.evaluate(async () => (await import('/src/lib/types.ts')).defaults());
    await p.addInitScript(initial => {
      initial.settings.motion = false; initial.settings.sound = false;
      const callbacks = new Map(), handlers = new Map(); let id = 0;
      const cfg = JSON.parse(localStorage.getItem('website-qa-config') || 'null') || initial;
      const qa = window.websiteQA = {config:cfg, nextImage:null, failPick:false, failSave:false, launches:[], imageKinds:[],
        emit(action) { callbacks.get(handlers.get('input'))?.({event:'input',id:1,payload:action}); }};
      window.isTauri = true;
      window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {unregisterListener:event => handlers.delete(event)};
      window.__TAURI_INTERNALS__ = {
        transformCallback:fn => { callbacks.set(++id,fn); return id; }, unregisterCallback:i => callbacks.delete(i),
        convertFileSrc:path => path.endsWith('website.webp') ? '/art/internet-card.webp' : path,
        invoke:async(cmd,args={}) => {
          if(cmd==='plugin:event|listen') {handlers.set(args.event,args.handler);return args.handler;}
          if(cmd==='bootstrap') return {config:structuredClone(qa.config),native:true,version:'0.10.1',sessions:[],controller:'Xbox',warning:null};
          if(cmd==='save_config') {
            if(qa.failSave) throw Error('Save unavailable');
            qa.config=structuredClone(args.config);localStorage.setItem('website-qa-config',JSON.stringify(qa.config));return qa.config;
          }
          if(cmd==='scan_apps') return [];
          if(cmd==='pick_image') {qa.imageKinds.push(args.kind);if(qa.failPick)throw Error('Image is unreadable or too large.');return qa.nextImage;}
          if(cmd==='launch_app') {qa.launches.push(args.id);return {appId:args.id,state:'external',name:'My cinema'};}
          if(cmd==='audio_state') return {outputs:[],defaultId:null,volume:null,muted:false};
          return null;
        },
      };
    }, initial);
    await p.reload();
    const open = async () => {
      await p.getByRole('button',{name:'Library',exact:true}).click();
      await p.getByRole('button',{name:'Add',exact:true}).click();
      await p.getByRole('button',{name:'Add website',exact:true}).click();
      await p.getByRole('heading',{name:'Add website',exact:true}).waitFor();
    };
    const form = p.locator('.website-form');
    const submit = () => form.getByRole('button',{name:'Add website',exact:true}).click();
    const send = action => p.evaluate(a=>window.websiteQA.emit(a),action);
    const layout = async suffix => {
      assert(await form.evaluate(el=>{
        const rect=el.getBoundingClientRect(), footer=el.querySelector('footer').getBoundingClientRect();
        return rect.left>=0 && rect.right<=innerWidth+1 && rect.top>=0 && footer.bottom<=innerHeight &&
          [...el.querySelectorAll('fieldset,.website-body,.website-artwork,footer')].every(e=>e.scrollWidth<=e.clientWidth+1);
      }), 'Website form overflow: '+suffix);
      await p.screenshot({path:'output/playwright/website-'+suffix+'.png',animations:'disabled'});
    };
    await open();
    assert(await p.getByLabel('Web address',{exact:true}).evaluate(el=>el===document.activeElement),'URL lacks initial focus');
    // Controller reaches the name field and opens the existing on-screen keyboard.
    await send('down');
    assert(await p.getByLabel('Name',{exact:true}).evaluate(el=>el===document.activeElement),'Controller cannot reach Name');
    await send('accept-down');await send('accept-up');
    await p.locator('.keyboard-panel textarea').fill('My cinema');
    await p.getByRole('button',{name:'Done',exact:true}).click();
    assert(await p.getByLabel('Name',{exact:true}).inputValue()==='My cinema','Keyboard lost the name');
    await p.getByLabel('Web address',{exact:true}).fill('javascript:alert(1)');await submit();
    await form.getByRole('alert').waitFor();
    assert(await p.evaluate(()=>window.websiteQA.config.apps.length)===0,'Invalid URL was saved');
    await form.getByRole('button',{name:'Web address keyboard',exact:true}).click();
    await p.locator('.keyboard-panel textarea').fill('https://example.com/watch?q=cinema#latest');
    await p.getByRole('button',{name:'Done',exact:true}).click();
    assert(await p.getByLabel('Web address',{exact:true}).inputValue()==='https://example.com/watch?q=cinema#latest','Keyboard lost the URL');
    await form.getByRole('button',{name:'Choose image…',exact:true}).click();
    assert(await form.locator('.website-preview img').count()===0,'Cancelled image dialog added artwork');
    await p.evaluate(()=>window.websiteQA.failPick=true);
    await form.getByRole('button',{name:'Choose image…',exact:true}).click();
    await form.getByText('Image is unreadable or too large.',{exact:true}).waitFor();
    await p.evaluate(()=>{window.websiteQA.failPick=false;window.websiteQA.nextImage='C:\\Canapey\\art\\website.webp';});
    await form.getByRole('button',{name:'Choose image…',exact:true}).click();
    await form.locator('.website-preview img').waitFor();
    assert(await form.locator('.website-preview img').evaluate(img=>img.complete && img.naturalWidth>0),'Artwork failed to render');
    await form.getByRole('button',{name:'Remove image',exact:true}).click();
    assert(await form.locator('.website-preview img').count()===0,'Remove image did not clear preview');
    await form.getByRole('button',{name:'Choose image…',exact:true}).click();
    await layout('desktop');
    await p.setViewportSize({width:390,height:844});await layout('mobile');
    await p.evaluate(()=>window.websiteQA.failSave=true);await submit();
    await form.getByText('Could not save your website. Try again.',{exact:true}).waitFor();
    assert(await p.getByLabel('Name',{exact:true}).inputValue()==='My cinema','Save failure lost form data');
    assert(await form.locator('.website-preview img').count()===1,'Save failure lost artwork');
    await layout('save-error-mobile');
    await p.evaluate(()=>window.websiteQA.failSave=false);await submit();await form.waitFor({state:'hidden'});
    let saved=await p.evaluate(()=>window.websiteQA.config.apps);
    assert(saved.length===1 && saved[0].target.kind==='uri' && saved[0].target.args.length===0,'Website is not a direct URI');
    assert(saved[0].card==='C:\\Canapey\\art\\website.webp' && saved[0].name==='My cinema','Saved website fields differ');
    assert(await p.evaluate(()=>window.websiteQA.imageKinds.every(kind=>kind==='card')),'Wrong image import type');
    await p.reload();
    assert(await p.evaluate(()=>window.websiteQA.config.apps[0].card)==='C:\\Canapey\\art\\website.webp','Artwork not persisted');
    await p.getByRole('button',{name:'Library',exact:true}).click();
    await p.getByRole('button',{name:'My cinema',exact:true}).click();
    await p.waitForFunction(()=>window.websiteQA.launches.length===1);
    assert(await p.evaluate(()=>window.websiteQA.launches[0]===window.websiteQA.config.apps[0].id),'Launch dispatched the wrong card');
    await open();
    await p.getByLabel('Name',{exact:true}).fill('Duplicate');
    await p.getByLabel('Web address',{exact:true}).fill('HTTPS://EXAMPLE.COM:443/watch?q=cinema#latest');await submit();
    await form.getByText('This website is already in your library.',{exact:true}).waitFor();
    await send('back');await p.getByRole('heading',{name:'Add apps',exact:true}).waitFor();
    assert(await p.getByRole('button',{name:'Add website',exact:true}).evaluate(el=>el===document.activeElement),'Back lost source-button focus');
    await p.getByRole('button',{name:'Add website',exact:true}).click();
    assert(await p.getByLabel('Name',{exact:true}).inputValue()==='','Cancelled draft was retained');
    await p.getByLabel('Name',{exact:true}).fill('Local media');
    await p.getByLabel('Web address',{exact:true}).fill('http://192.168.1.20:8096/web/');await submit();
    await form.waitFor({state:'hidden'});
    saved=await p.evaluate(()=>window.websiteQA.config.apps);
    assert(saved.length===2 && saved[1].card===null,'Image-free local website failed');
    assert(!errors.length,errors.join('\n'));
    return {passed:true,checks:['URL validation and duplicates','image choose/cancel/error/remove','controller and on-screen keyboard','save failure and retry','persistence and launch IPC','local HTTP site without image','desktop 1440x900 and mobile 390x844']};
  } finally { await context.close(); }
}
