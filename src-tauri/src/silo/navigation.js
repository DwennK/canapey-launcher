// Runs at document start in the configured Silo origin, in the top frame only.
(() => {
  const controls =
    'a[href],button,input:not([type=hidden]),textarea,select,[contenteditable=true],[tabindex]:not([tabindex="-1"]),[role=button],[role^=menuitem],[role=option],[role=tab],[role=slider]';
  const layers = 'dialog[open],[role=dialog],[role=alertdialog],[role=listbox],[role=menu]';
  const editing =
    'textarea,input:not([type=button],[type=submit],[type=checkbox],[type=radio],[type=range]),[contenteditable=true]';
  const marks = new Map();
  let route = location.href;
  const trail = [{ url: route, index: history.state?.idx ?? 0 }];
  let pending;
  let restored;
  let exitingPlayer = false;
  let queuedBack = false;
  let initial = true;
  let opener;
  let layer;
  let frame;
  let releasedField;
  let editingSlider;
  let keyboard;
  let field;
  let upper = false;

  function visible(el) {
    const rect = el.getBoundingClientRect();
    if (!card(el) && (rect.right < 1 || rect.left >= innerWidth)) return false;
    return (
      !el.closest(
        '[inert],[hidden],[aria-hidden=true],[role=dialog][data-state=closed],[role=menu][data-state=closed]',
      ) &&
      !el.matches(':disabled,[aria-disabled=true]') &&
      rect.width > 1 &&
      rect.height > 1 &&
      el.checkVisibility({ checkVisibilityCSS: true, checkOpacity: true })
    );
  }
  function player() {
    return [...document.querySelectorAll('.player-container')].find(
      (el) => el.querySelector('video') && el.getBoundingClientRect().width >= innerWidth * 0.8,
    );
  }
  function wakePlayer(hud) {
    hud.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
  }
  function playButton(hud) {
    return [...hud.querySelectorAll('.hud-play-btn,button[data-paused]')].find(
      (button) => button.getClientRects().length > 0,
    );
  }
  function transport(hud, key) {
    const play = playButton(hud);
    // Silo places its profile-specific skip buttons immediately beside Play.
    // Use its own handlers so remuxed streams and watch parties seek correctly.
    const button = {
      MediaPlayPause: play,
      MediaTrackPrevious: play?.previousElementSibling,
      MediaTrackNext: play?.nextElementSibling,
      MediaStop: hud.querySelector('.hud-top-chrome .hud-glass-btn--text'),
    }[key];
    if (button?.matches('button:enabled')) button.click();
  }
  function scope() {
    if (keyboard) return keyboard;
    const panels = [...document.querySelectorAll(layers)].filter(visible);
    // Subtitle delay and track choices can be sibling groups inside one dialog.
    const top = panels.at(-1);
    return top?.closest('.player-menu-surface') || top || player() || document;
  }
  function card(el) {
    return el?.closest('.embla__slide,.media-card-longpress');
  }
  function candidates(root) {
    const items = [...root.querySelectorAll(controls)].filter(
      (el) => !el.matches('.embla__viewport,.sr-only') && !el.closest('.sr-only') && visible(el),
    );
    const representatives = new Map();
    const allowed = new Set(items);
    for (const el of items) {
      const tile = card(el);
      if (!tile || representatives.has(tile)) continue;
      // Continue Watching's heading opens the series. Its image opens the episode.
      const target = tile.querySelector('a.bidi-text[href]') || tile.querySelector('a[href]') || el;
      representatives.set(tile, allowed.has(target) ? target : el);
    }
    return items.filter((el) => !card(el) || representatives.get(card(el)) === el);
  }
  function box(el) {
    return (card(el) || el).getBoundingClientRect();
  }
  // Continue Watching may reorder the focused series when playback progress is flushed.
  const watchPoster = new IntersectionObserver(
    (entries) => {
      const tile = card(document.activeElement);
      if (entries.some((entry) => entry.target === tile && entry.intersectionRatio < 0.98)) {
        tile.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
      }
    },
    { threshold: [0, 0.98, 1] },
  );
  document.addEventListener('focusin', (e) => {
    watchPoster.disconnect();
    const tile = card(e.target);
    if (tile) watchPoster.observe(tile);
    if (pending) schedule();
  });
  function focus(el) {
    if (!el) return;
    el.focus({ preventScroll: true });
    (card(el) || el).scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
  }
  function choose(from, items, key) {
    const a = box(from);
    const horizontal = key === 'ArrowLeft' || key === 'ArrowRight';
    const sign = key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : 1;
    const row = from.closest('.embla__container');
    const main = from.closest('main');
    const section = from.closest('section');
    const scores = [];
    for (const el of items) {
      if (el === from || el.contains(from) || from.contains(el)) continue;

      const b = box(el);
      const x = (b.left + b.right - a.left - a.right) / 2;
      const y = (b.top + b.bottom - a.top - a.bottom) / 2;
      const advance = sign * (horizontal ? x : y);
      if (advance < 2) continue;
      const cross = Math.abs(horizontal ? y : x);
      const overlap = horizontal
        ? Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
        : Math.min(a.right, b.right) - Math.max(a.left, b.left);
      if (horizontal && row && card(el) && !row.contains(el)) continue;
      if (!horizontal && row && row.contains(el)) continue;
      if (horizontal && overlap <= 0 && main === el.closest('main')) continue;
      // Compare aligned controls first, then forward distance and column offset.
      const otherSection = el.closest('section');
      const rank = horizontal
        ? row?.contains(el) || overlap > 0
          ? 0
          : 1
        : main !== el.closest('main')
          ? 3
          : (row || (main && location.pathname === '/' && key === 'ArrowDown')) &&
              card(el) &&
              section !== otherSection
            ? 0
            : 1;
      scores.push({ el, rank, distance: advance, score: advance + cross * (horizontal ? 2 : 0.7) });
    }
    scores.sort(
      (a, b) =>
        a.rank - b.rank ||
        (!horizontal && a.rank === 0 && Math.abs(a.distance - b.distance) > 12
          ? a.distance - b.distance
          : a.score - b.score),
    );
    return scores[0]?.el;
  }
  function identity(el) {
    if (el.matches('a[href]')) return JSON.stringify(['link', el.getAttribute('href')]);
    return JSON.stringify([
      el.tagName,
      el.id,
      el.name,
      el.getAttribute('aria-label'),
      (el.textContent || '').trim().slice(0, 120),
    ]);
  }
  function scrollBoxes(el) {
    const boxes = [];
    for (let p = el.parentElement; p; p = p.parentElement) {
      if (p.scrollWidth > p.clientWidth || p.scrollHeight > p.clientHeight) boxes.push(p);
    }
    return boxes;
  }
  function remember(el) {
    if (!el || scope() !== document || el.matches(editing)) return;
    marks.set(route, {
      key: identity(el),
      section: el.closest('section')?.querySelector('h2,h3')?.textContent,
      scroll: scrollBoxes(el).map((p) => [p.scrollLeft, p.scrollTop]),
    });
    if (marks.size > 32) marks.delete(marks.keys().next().value);
  }
  function refresh() {
    frame = 0;
    if (!document.body) return;
    const changed = route !== location.href;
    if (changed) {
      initial = true;
      route = location.href;
      const previous = trail.findLastIndex((entry) => entry.url === route);
      if (previous >= 0) trail.splice(previous + 1);
      else trail.push({ url: route, index: history.state?.idx });
      restored = null;
      pending = marks.get(route);
      releasedField = null;
    }
    const root = scope();
    if (
      exitingPlayer &&
      !location.pathname.includes('/watch/') &&
      root === document &&
      (!pending ||
        document.querySelector('main button:has(.lucide-play)') ||
        candidates(root).some((el) => identity(el) === pending.key))
    ) {
      exitingPlayer = false;
      if (queuedBack) {
        queuedBack = false;
        requestAnimationFrame(backOnePage);
        return;
      }
    }
    const popup = root !== document && root !== player() ? root : null;
    if (!popup && layer && opener?.isConnected) focus(opener);
    layer = popup;
    const active = document.activeElement;
    if (initial && !pending && root === document) {
      const selector = location.pathname.startsWith('/item/')
        ? 'main button:has(.lucide-play),main a[href^="/watch/"]'
        : location.pathname === '/'
          ? 'main a[href],main button'
          : null;
      const target = selector && [...document.querySelectorAll(selector)].find(visible);
      if (target) {
        initial = false;
        focus(candidates(root).find((el) => card(target) && card(el) === card(target)) || target);
        return;
      }
    }
    if (pending && restored === active && active.isConnected) return;
    if (!changed && !pending && active.matches(controls) && root.contains(active) && visible(active))
      return;
    const items = candidates(root);
    if (pending && root === document) {
      const matches = items.filter((el) => identity(el) === pending.key);
      const el =
        matches.find(
          (el) => el.closest('section')?.querySelector('h2,h3')?.textContent === pending.section,
        ) || matches[0];
      if (el) {
        if (!restored)
          scrollBoxes(el).forEach((p, i) => {
            if (pending.scroll[i])
              p.scrollTo({ left: pending.scroll[i][0], top: pending.scroll[i][1], behavior: 'instant' });
          });
        restored = el;
        focus(el);
        initial = false;
        return;
      }
    }
    if (active.matches(controls) && !changed && root.contains(active) && visible(active)) return;
    focus(
      items.find((el) => el.matches('.hud-play-btn')) ||
        items.find((el) => el.closest('main')) ||
        items[0],
    );
  }
  function schedule() {
    if (!frame) frame = requestAnimationFrame(refresh);
  }

  function closeKeys() {
    layer = null;
    keyboard.remove();
    keyboard = null;
    releasedField = field;
    focus(field);
  }
  function type(text) {
    const start = field.selectionStart ?? field.value.length;
    const end = field.selectionEnd ?? start;
    const remove = text === null;
    const left = remove && start === end ? Math.max(0, start - 1) : start;
    const value = field.value.slice(0, left) + (text || '') + field.value.slice(end);
    if (field.maxLength >= 0 && value.length > field.maxLength) return;
    const prototype =
      field instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(field, value);
    try {
      field.setSelectionRange(left + (text || '').length, left + (text || '').length);
    } catch {
      /* Email fields have no selection API. */
    }
    field.dispatchEvent(new Event('input', { bubbles: true }));
  }
  function openKeys(input) {
    field = input;
    keyboard = document.createElement('div');
    keyboard.id = 'canapey-silo-keys';
    keyboard.setAttribute('role', 'dialog');
    const rows = [
      '1234567890',
      'qwertyuiop',
      'asdfghjkl',
      'zxcvbnm',
      '@._-/:!?+#',
      '$%&*()=,;\x27',
      '[]{}<>|~^\x60',
      '"\\\\',
    ];
    const key = (row, label, press) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.onclick = press;
      row.append(b);
      return b;
    };
    for (const letters of rows) {
      const row = document.createElement('div');
      for (const c of letters)
        key(row, upper ? c.toUpperCase() : c, () => type(upper ? c.toUpperCase() : c));
      keyboard.append(row);
    }
    const row = document.createElement('div');
    key(row, '⇧', () => {
      upper = !upper;
      keyboard.querySelectorAll('button').forEach((b) => {
        if (/^[a-z]$/i.test(b.textContent))
          b.textContent = upper ? b.textContent.toUpperCase() : b.textContent.toLowerCase();
      });
    });
    key(row, '␣', () => type(' '));
    key(row, '⌫', () => type(null));
    key(row, '✓', closeKeys);
    keyboard.append(row);
    (input.closest(layers) || document.body).append(keyboard);
    focus(keyboard.querySelector('button'));
  }
  window.addEventListener(
    'click',
    (event) => {
      pending = null;
      const el = event.target.closest?.(controls);
      if (el && !keyboard && !el.closest(layers)) {
        remember(el);
        opener = el;
      }
    },
    true,
  );
  function backOnePage() {
    if (history.length < 2) return;
    const distance = trail.at(-2)?.index - history.state?.idx;
    history.go(Number.isInteger(distance) && distance < 0 ? distance : -1);
  }
  window.addEventListener(
    'keydown',
    (e) => {
      if (location.href !== route) refresh();
      initial = false;
      if (e.altKey || e.ctrlKey || e.metaKey || e.isComposing) return;
      const back = ['Escape', 'Backspace', 'BrowserBack'].includes(e.key);
      const eat = () => {
        e.preventDefault();
        e.stopImmediatePropagation();
      };
      if (['MediaPlayPause', 'MediaTrackPrevious', 'MediaTrackNext', 'MediaStop'].includes(e.key)) {
        const hud = player();
        if (!hud) return;
        eat();
        wakePlayer(hud);
        if (!e.repeat || e.key === 'MediaTrackPrevious' || e.key === 'MediaTrackNext') {
          transport(hud, e.key);
        }
        return;
      }
      if (!back && e.key !== 'Enter' && !e.key.startsWith('Arrow')) return;
      if (e.repeat && (e.key === 'Enter' || (back && e.key !== 'Backspace'))) {
        eat();
        return;
      }
      const active = document.activeElement;
      if (!active || !document.body) return;
      const input = active.matches(editing);
      if (input && releasedField !== active) {
        if (e.key === 'Escape' && active.closest(layers)) return;
        if (e.key === 'Escape' || e.key === 'BrowserBack') {
          eat();
          releasedField = active;
        } else if (
          e.key === 'Enter' &&
          (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement)
        ) {
          eat();
          openKeys(active);
        }
        return;
      }
      if (keyboard && back) {
        eat();
        closeKeys();
        return;
      }
      if (back && e.repeat) {
        eat();
        return;
      }
      const root = scope();
      if (back) {
        if (editingSlider === active) {
          eat();
          editingSlider = null;
          return;
        }
        if (root.matches?.(layers) || root.matches?.('.player-menu-surface')) {
          // Radix and the Silo player own Escape, including nested menus.
          if (e.key !== 'Escape') {
            eat();
            active.dispatchEvent(
              new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
            );
          }
          return;
        }
        eat();
        const exit =
          location.pathname.includes('/watch/') &&
          player()?.querySelector('.hud-top-chrome .hud-glass-btn--text');
        if (exitingPlayer) queuedBack = true;
        else if (exit) {
          exitingPlayer = true;
          exit.click();
        } else backOnePage();
        return;
      }
      const hud = player();
      const horizontal = e.key === 'ArrowLeft' || e.key === 'ArrowRight';
      if (hud && root === hud) {
        const play = playButton(hud);
        const timeline = hud.querySelector('[data-player-seek-slider]') || hud.querySelector('.player-hud [role=slider]');
        const hidden = play && (hud.classList.contains('cursor-none') || !visible(play));
        wakePlayer(hud);
        if (timeline && active === timeline && horizontal) {
          // Let Silo handle the trusted key using the profile's skip interval.
          return;
        }
        if (hidden) {
          eat();
          if (horizontal) {
            focus(timeline);
            transport(hud, e.key === 'ArrowLeft' ? 'MediaTrackPrevious' : 'MediaTrackNext');
          } else {
            focus(play);
            if (e.key === 'Enter') transport(hud, 'MediaPlayPause');
          }
          return;
        }
        if (timeline && active === timeline && e.key === 'Enter') {
          eat();
          focus(play);
          return;
        }
      }
      if (active.matches('input[type=range],[role=slider]')) {
        if (e.key === 'Enter') {
          eat();
          editingSlider = editingSlider === active ? null : active;
          return;
        }
        if (editingSlider === active && ['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      }
      editingSlider = null;
      pending = null;
      if (e.key === 'Enter') {
        if (input) {
          eat();
          releasedField = null;
          if ('value' in active) openKeys(active);
          return;
        }
        // Native activation is important for Radix triggers (keydown) and form submission.
        if (active.matches('a[href],button,input,select,[role^=menuitem],[role=option],[role=tab]')) {
          remember(active);
          if (!layer && !keyboard) opener = active;
          return;
        }
        if (root.contains(active) && active.matches('[role=button],[tabindex]')) {
          eat();
          remember(active);
          active.click();
        }
        return;
      }
      eat();
      const items = candidates(root);
      const next = items.includes(active)
        ? choose(active, items, e.key)
        : items.find((el) => el.matches('.hud-play-btn')) || items[0];
      if (next) {
        releasedField = null;
        focus(next);
      }
    },
    true,
  );
  function start() {
    const css = document.createElement('style');
    css.textContent = `
      :focus {outline:4px solid white!important;outline-offset:-4px!important;box-shadow:inset 0 0 0 7px #2458df!important}
      .embla__slide:focus-within,.media-card-longpress:focus-within {outline:4px solid white!important;outline-offset:-4px;box-shadow:inset 0 0 0 7px #2458df;border-radius:10px}
      #canapey-silo-keys {position:fixed;inset:auto 0 0;z-index:2147483647;background:#151822;color:white;padding:1vh;text-align:center}
      #canapey-silo-keys button {background:#33394a;color:white;margin:2px;font:600 clamp(15px,2vh,25px) sans-serif;min-width:min(8vw,70px);height:4.5vh;border-radius:5px}`;
    document.head.append(css);
    new MutationObserver(schedule).observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['aria-hidden', 'data-state', 'open'],
    });
    window.addEventListener('popstate', schedule);
    schedule();
  }
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
