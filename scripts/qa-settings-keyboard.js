// Playwright CLI run-code. All navigation uses physical keyboard events.
// Native services are fixtures; no Windows power, pairing or installation is performed.
async page => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({width:1440, height:900});
  const config = await page.evaluate(async () => (await import('/src/lib/types.ts')).defaults());
  await page.addInitScript(initial => {
    const config = initial;
    config.settings.motion = false;
    if (innerWidth===1280) config.settings.scale=1.4;
    config.settings.appleRemote.enabled = true;
    config.apps = ['Cinema', 'Music', 'Games'].map(id => ({
      id, name:id, theme:'home', card:null, background:null, icon:null, source:'QA',
      target:{kind:'executable', value:'C:\\QA\\'+id+'.exe', args:[], workingDir:null},
    }));
    let callback = 0;
    const tv = {name:'QA TV', protocol:'philips', ip:'192.0.2.1', mac:'02:11:22:33:44:55'};
    const tvStatus = {available:true, tv, autoWake:true, autoStandby:false, waking:false, resumeAvailable:true, hdmiPort:2, wakeProgress:{packetSent:true,reachable:true,powerConfirmed:true,inputSent:false,retryInput:true}};
    const pairing = {pin:null, secondsRemaining:100, devices:[{id:'qa-phone',connected:true}]};
    window.isTauri = true;
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {unregisterListener() {}};
    window.__TAURI_INTERNALS__ = {
      transformCallback:() => ++callback, unregisterCallback() {}, convertFileSrc:path => path,
      invoke:async (command,args={}) => {
        switch(command) {
          case 'plugin:event|listen': return ++callback;
          case 'bootstrap': return {native:true,config,version:'0.10.0',warning:null,controller:'QA controller',sessions:[{appId:'Cinema',name:'Cinema',status:'running',canForce:true}]};
          case 'save_config': return args.config;
          case 'list_monitors': return [{id:'tv',name:'QA display',primary:false}];
          case 'xbox_home_status': return {available:true,connected:true,test:'idle'};
          case 'set_remote_capture': window.__learningKey=args.enabled; return;
          case 'remote_home_status': return {available:true,active:[],error:null};
          case 'apple_remote_status': return {available:true,running:true,networks:[{id:'lan',label:'LAN',address:'192.0.2.2'}],pairing};
          case 'apple_remote_pair': pairing.pin='0123'; return;
          case 'apple_remote_cancel_pairing': pairing.pin=null; return;
          case 'tv_discover': return [tv];
          case 'tv_pair': return {secondsRemaining:90,name:tv.name};
          case 'tv_hdmi_ports': return [1,2];
          case 'tv_set_hdmi': tvStatus.hdmiPort=args.port; return tvStatus;
          case 'tv_pair_finish':
          case 'tv_status': return tvStatus;
          case 'check_update': return {state:'available',version:'0.10.1',notes:'## Changes\n'+'\n- Example change.'.repeat(24)};
          case 'scan_apps': return [];
          default: return null;
        }
      },
    };
  },config);
  const press = key => page.keyboard.press(key);
  const button = name => pane.getByRole('button',{name,exact:true});
  const assert = (ok,message) => { if (!ok) throw Error(message); };
  const focused = locator => locator.evaluate(el => el === document.activeElement);
  const pane = page.locator('.settings-content');
  const routeNames = ['Display','Ambience','Sound','Apps','Controllers','Remote','iPhone','TV','Startup and system','Updates','Diagnostics'];
  const routes = ['display','ambience','sound','apps','controls','remote','iphone','tv','system','updates','diagnostic'];
  const counts = [];
  async function tabTo(locator) {
    await locator.waitFor({timeout:3000});
    const travel = await locator.evaluate(target => {
      const dialog = target.closest('[role=dialog]');
      const stops = [...dialog.querySelectorAll('button:enabled,input:enabled,select:enabled,textarea:enabled,summary,[tabindex="0"]')].filter(e=>e.checkVisibility());
      const start = stops.indexOf(document.activeElement), end = stops.indexOf(target);
      const forward = (end-start+stops.length)%stops.length;
      return {key: start>=0 && forward>stops.length/2 ? 'Shift+Tab' : 'Tab', limit:stops.length+2};
    });
    for (let i=0;i<travel.limit;i++) {
      if (await focused(locator)) return;
      await press(travel.key);
    }
    throw Error('Tab cannot reach '+locator);
  }
  async function activate(locator) { await tabTo(locator); await press('Enter'); }
  async function open(title) {
    await press('Control+f');
    await page.keyboard.type(title);
    await press('Enter');
    await page.locator('[data-settings-page="'+routes[routeNames.indexOf(title)]+'"]').waitFor({timeout:3000});
    await page.waitForFunction(()=>document.querySelector('.settings-page')?.children.length);
  }
  // Compare native forward/reverse Tab order against an independent inventory.
  // Probe arrows from every reachable stop and check the graph from page entry.
  async function audit(label) {
    const candidates = pane.locator('button:enabled,input:enabled,select:enabled,textarea:enabled,summary,[tabindex="0"]');
    const items = [];
    for (const item of await candidates.all()) if(await item.evaluate(e=>e.checkVisibility())) items.push(item);
    const count = items.length;
    const index = () => candidates.evaluateAll(els=>els.filter(e=>e.checkVisibility()).indexOf(document.activeElement));
    const start = await index();
    assert(count && start>=0,label+' opened without focused content');
    const first = items[start];
    let forwardOrder;
    for(const key of ['Tab','Shift+Tab']){
      const visited = [];
      for(let i=0;i<count+20;i++){
        const n = await index();
        if(n>=0) visited.push(n);
        await press(key);
        const visible = await page.evaluate(() => {
          const active = document.activeElement;
          const rect = active.getBoundingClientRect();
          const clip = active.closest('.settings-sections,.settings-content,.settings-shell')?.getBoundingClientRect();
          return clip && rect.bottom>Math.max(0,clip.top) && rect.top<Math.min(innerHeight,clip.bottom)
            && rect.right>Math.max(0,clip.left) && rect.left<Math.min(innerWidth,clip.right);
        });
        assert(visible,label+' moved focus out of view on '+key);
        if(await focused(first)) break;
      }
      assert(visited.length===count && new Set(visited).size===count && await focused(first),label+' incomplete '+key+' cycle: '+JSON.stringify({count,start,visited}));
      if (key==='Tab') forwardOrder=visited;
      else assert(visited.slice(1).every((n,i)=>n===forwardOrder[count-i-1]),label+' changed the reverse Tab order');
    }
    const edges = [];
    for(let n=0;n<count;n++){
      const destinations = [];
      for(const key of ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight']){
        await tabTo(items[n]);await press(key);destinations.push(await index());
      }
      edges.push(destinations);
    }
    const seen=new Set(), pending=[start];
    while(pending.length){const n=pending.pop();if(n<0||seen.has(n))continue;seen.add(n);pending.push(...edges[n]);}
    const missing=[];
    for(let n=0;n<count;n++) if(!seen.has(n)) missing.push(await items[n].evaluate(e=>e.getAttribute('aria-label')||e.textContent||e.type));
    assert(!missing.length,label+' unreachable with arrows: '+missing.join(', '));
    counts.push([label,count]);
    await tabTo(first);
  }
  for(const viewport of [{width:1440,height:900},{width:390,height:844},{width:1920,height:1080},{width:1280,height:720}]){
    await page.setViewportSize(viewport);await page.reload();await page.locator('.launcher.ready').waitFor();
    await press('F1');
    for(let i=0;i<routes.length;i++){
      const row=page.locator('[data-settings-route="'+routes[i]+'"]');
      assert(await focused(row),'Unexpected sidebar order at '+routes[i]);
      await press('ArrowRight');
      await page.locator('[data-settings-page="'+routes[i]+'"]').waitFor();
      await page.waitForFunction(()=>!!document.activeElement.closest('.settings-page'));
      await audit(viewport.width+' '+routes[i]);
      await press('Escape');assert(await focused(row),'Back lost '+routes[i]);
      if(i+1<routes.length)await press('ArrowDown');
    }
    await open('Display');
    const searchOrigin = page.getByLabel('Preferred display',{exact:true});
    await tabTo(searchOrigin);await press('Control+f');await page.keyboard.type('no such setting');
    await page.getByText('No matching settings.',{exact:true}).waitFor();await press('Escape');
    assert(await focused(searchOrigin),'Closing search lost the display field at '+viewport.width);
    await press('Escape');await press('Escape');
  }
  await page.setViewportSize({width:1440,height:900});await press('F1');
  await open('Display');const monitor=page.getByLabel('Preferred display',{exact:true});
  await activate(monitor);await press('ArrowDown');await press('Enter');
  assert(await focused(monitor) && await monitor.inputValue()==='tv','Display selection or focus restoration failed');
  await activate(monitor); await press('ArrowUp'); await press('ArrowUp');
  assert(await focused(page.locator('.setting-choice header button')),'Up cannot reach choice cancellation');
  await press('Enter'); assert(await focused(monitor),'Cancel lost the select');
  await open('Ambience');await activate(button('Lavender'));assert(await button('Lavender').getAttribute('aria-pressed')==='true','Selector color was not applied');
  await open('Sound');const sound=page.getByRole('switch',{name:'Navigation sounds'});
  if(!(await sound.isChecked()))await activate(sound);
  const volume=pane.locator('input[type=range]');await tabTo(volume);const value=await volume.inputValue();await press('ArrowRight');
  assert(Number(await volume.inputValue())>Number(value),'Volume adjustment failed');
  await open('Apps');await activate(button('Add'));await page.getByRole('dialog',{name:'Add apps'}).waitFor();await press('Escape');assert(await focused(button('Add')),'Add lost its origin');
  await activate(button('Edit Cinema'));await page.getByRole('dialog',{name:'Customize an app'}).waitFor();await press('Escape');assert(await focused(button('Edit Cinema')),'Editor lost its origin');
  await press('ArrowDown');assert(await focused(button('Edit Music')),'Down left the Edit column');
  await press('ArrowUp');assert(await focused(button('Edit Cinema')),'Up left the Edit column');
  await open('Controllers');await activate(button('Test controller'));await activate(button('Start test'));await press('Escape');assert(await focused(button('Start test')),'Test controller lost its exit');
  await activate(button('Xbox / Steam Input troubleshooting'));await button('Open Game Bar settings').waitFor();await audit('expanded controllers');
  await open('Remote');await activate(button('Set up essential buttons'));await activate(button('Skip this button'));await activate(button('Exit guide'));
  await activate(button('Learn key')); await page.getByText('Cancel listening',{exact:true}).waitFor();
  await press('z'); await button('Relearn key').waitFor();
  await page.waitForFunction(()=>window.__learningKey === false); await tabTo(button('Save'));
  await activate(button('Choose on the remote'));await audit('remote photo');
  await open('iPhone');await activate(button('Pair an iPhone'));await activate(button('Cancel pairing'));await activate(page.getByText('Name and network',{exact:true}));
  const phoneName=page.getByLabel('Name shown on iPhone');await tabTo(phoneName);await press('Backspace');assert(await focused(phoneName),'Backspace backed out of a text field');await press('End');await page.keyboard.type(' TV');await press('Backspace');assert((await phoneName.inputValue()).endsWith(' T'),'Backspace did not edit the name');await press('Tab');
  await activate(button('Save settings'));await audit('iPhone connection settings');
  await open('TV');await activate(button('Find HDMI inputs'));await activate(pane.locator('.tv-inputs select'));await press('Escape');
  await activate(button('Open startup settings'));await press('Escape');assert(await focused(button('Open startup settings')),'Linked page lost its origin');
  await activate(button('Change TV'));await activate(button('Find my TV'));await activate(pane.locator('.tv-result'));
  assert(await focused(button('Show code on TV')),'Selecting a TV should focus pairing');await press('Enter');
  const pin=page.getByLabel('TV pairing code');assert(await focused(pin),'TV PIN did not receive focus');await page.keyboard.type('0123');await press('Enter');await pane.locator('.tv-connected').waitFor({timeout:3000});
  await open('Startup and system');await activate(button('Power'));await page.getByRole('dialog',{name:'Power'}).waitFor();await press('Escape');assert(await focused(button('Power')),'Power lost its origin');
  await open('Updates');await activate(button('Check for updates'));await pane.locator('.release-notes').waitFor();await audit('update with release notes');
  await activate(button('Close apps and install'));await press('Escape');assert(await focused(button('Close apps and install')),'Install confirmation lost its origin');
  await open('Diagnostics');await activate(button('Quit Canapey'));await press('Escape');assert(await focused(button('Quit Canapey')),'Quit confirmation lost its origin');
  assert(!errors.length,errors.join('\n'));
  return {passed:true,counts};
}
