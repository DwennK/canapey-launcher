// Isolated Chrome QA with an IPC fixture. No native Windows app is launched.
async (page) => {
  const errors = [];
  // Clear touch emulation left by a previous interrupted run.
  const initialCdp = await page.context().newCDPSession(page);
  await initialCdp.send("Emulation.setTouchEmulationEnabled", {
    enabled: false,
  });
  await initialCdp.detach();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    const callbacks = new Map(),
      events = new Map();
    let id = 0;
    let config = {
      version: 1,
      selectedId: "spotify",
      apps: ["Spotify", "Internet", "Netflix"].map((name) => ({
        id: name.toLowerCase(),
        name,
        theme: name.toLowerCase(),
        target: {
          kind: "uri",
          value: "https://example.com/" + name,
          args: [],
          workingDir: null,
        },
        card: null,
        background: null,
        icon: null,
        source: "QA",
      })),
      settings: {
        fullscreen: true,
        autostart: false,
        monitor: null,
        scale: 1,
        motion: false,
        sound: false,
        deadzone: 0.24,
        returnShortcut: "startBack",
        holdMs: 1200,
      },
    };
    window.isTauri = true;
    window.__qa = {
      calls: [],
      resumeError: null,
      config: () => config,
      emit: (event, payload) =>
        callbacks.get(events.get(event))?.({ event, payload }),
    };
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
      unregisterListener: (event) => events.delete(event),
    };
    window.__TAURI_INTERNALS__ = {
      transformCallback: (fn) => {
        callbacks.set(++id, fn);
        return id;
      },
      unregisterCallback: (id) => callbacks.delete(id),
      convertFileSrc: (p) => p,
      invoke: async (cmd, args = {}) => {
        window.__qa.calls.push({ cmd, args });
        if (cmd === "plugin:event|listen") {
          events.set(args.event, args.handler);
          return args.handler;
        }
        if (cmd === "bootstrap")
          return {
            config,
            native: true,
            version: "0.3.3",
            sessions: [{appId:"spotify",name:"Spotify",status:"running",canForce:false}],
            controller: "Xbox QA",
            warning: null,
          };
        if (cmd === "save_config") {
          config = structuredClone(args.config);
          return config;
        }
        if (cmd === "launch_app")
          return {
            appId: args.id,
            name: args.id,
            status: "running",
            canForce: false,
          };
        if (cmd === "resume_app" && window.__qa.resumeError)
          throw new Error(window.__qa.resumeError);
        if (cmd === "list_monitors") return [];
        if (cmd === "check_update") return {state:'available',version:'0.3.4',notes:'## Nouveautés et corrections\n\n- **Télécommande** : nouvelles actions Windows.\n- Fermeture normale des applications suivies.\n\n### Installation\n\nTéléchargez `Canapey.Launcher_0.3.4_x64-setup.exe`.\nVos réglages sont conservés.\n\n<img src=x onerror=alert(1)>\n\n[Documentation](https://example.com/'+'long'.repeat(35)+')'};
        if (cmd === 'install_update') return new Promise((resolve,reject)=>{window.__qa.finishInstall=resolve;window.__qa.failInstall=reject;});
        return null;
      },
    };
  });
  await page.reload();
  const assert=(ok,message)=>{if(!ok)throw Error(message);};
  const open=async()=>{await page.getByRole('button',{name:'Paramètres',exact:true}).click();await page.getByRole('button',{name:'Mises à jour',exact:true}).click();};
  await open();
  await page.getByRole('button',{name:'Rechercher une mise à jour',exact:true}).click();
  await page.getByRole('heading',{name:'Version 0.3.4 disponible',exact:true}).waitFor();
  const install=page.getByRole('button',{name:'Fermer les applications et installer',exact:true});
  assert(await install.isEnabled(),'Running sessions block the update action');
  await page.locator('.release-notes h4').first().waitFor();
  assert(await page.locator('.release-notes li').count()===2,'Release notes lists missing');
  assert(await page.locator('.release-notes strong').innerText()==='Télécommande','Bold notes missing');
  assert(await page.locator('.release-notes img').count()===0,'Release notes interpreted HTML');
  assert(await page.locator('.release-notes').evaluate(el=>el.scrollWidth<=el.clientWidth+1),'Notes overflow horizontally');
  await page.screenshot({path:'output/playwright/updates-readable-desktop.png'});
  await page.locator('.release-notes').focus();
  const beforeScroll=await page.locator('.settings-content').evaluate(el=>el.scrollTop);
  await page.evaluate(()=>window.__qa.emit('input','down'));
  assert(await page.locator('.settings-content').evaluate(el=>el.scrollTop)>beforeScroll,'Controller cannot scroll release notes');
  await install.click();
  const dialog=page.getByRole('dialog',{name:'Installer la mise à jour ?',exact:true});
  await dialog.waitFor();
  assert((await dialog.innerText()).includes('Spotify'),'Confirmation does not name apps to close');
  await dialog.getByRole('button',{name:'Annuler',exact:true}).click();
  assert(await page.evaluate(()=>!window.__qa.calls.some(c=>c.cmd==='install_update')),'Cancel still installed');
  await install.click();await dialog.getByRole('button',{name:'Fermer les applications et installer',exact:true}).click();
  await page.evaluate(()=>window.__qa.emit('update-status','Fermeture de Spotify… Confirmez toute demande d’enregistrement dans l’application.'));
  await page.getByRole('status').filter({hasText:'Fermeture de Spotify'}).waitFor();
  assert(await dialog.getByRole('button',{name:'Fermer les applications et installer',exact:true}).isDisabled(),'Duplicate install permitted');
  await page.evaluate(()=>window.__qa.failInstall(Error('Spotify attend encore une fermeture. Enregistrez votre travail puis réessayez.')));
  await page.getByRole('button',{name:'Annuler',exact:true}).waitFor({state:'visible'});
  await page.getByRole('button',{name:'Annuler',exact:true}).click();
  await page.locator('.inline-error').filter({hasText:'Spotify attend encore'}).waitFor();
  await install.click();await dialog.getByRole('button',{name:'Fermer les applications et installer',exact:true}).click();
  await page.evaluate(()=>{window.__qa.emit('sessions',[]);window.__qa.emit('update-status','Téléchargement de la mise à jour…');});
  await page.getByRole('status').filter({hasText:'Téléchargement de la mise à jour'}).waitFor();
  await page.evaluate(()=>window.__qa.finishInstall());
  await dialog.waitFor({state:'hidden'});
  assert(await page.getByRole('button',{name:'Télécharger et installer',exact:true}).isEnabled(),'Successful flow did not return to settings');
  await page.setViewportSize({width:390,height:844});
  await page.locator('.release-notes').scrollIntoViewIfNeeded();
  assert(await page.locator('.settings-content').evaluate(el=>el.scrollWidth<=el.clientWidth+1),'Mobile update panel overflows');
  await page.screenshot({path:'output/playwright/updates-readable-mobile.png'});
  assert(errors.length===0,errors.join('\n'));
  return {passed:true,errors,scope:'Update UI and simulated IPC; no installer executed'};
}
