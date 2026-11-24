// Read the active Silo profile inside its own window. Only card data leaves this origin.
(() => {
  const request = window.fetch.bind(window);
  let session;
  function profile() {
    return sessionStorage.getItem('silo-profile-scope') === 'tab'
      ? sessionStorage.getItem('silo-tab-profile:profile_id')
      : localStorage.getItem('profile_id');
  }
  window.fetch = function (input, init) {
    const url = new URL(input instanceof Request ? input.url : input, location.href);
    if (url.origin === location.origin && url.pathname.startsWith('/api/v2/')) {
      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
      const id = headers.get('X-Profile-Id');
      if (id && id === profile() && headers.has('Authorization')) {
        // Forward only Silo's authentication and profile headers on our same-origin reads.
        const scoped = new Headers();
        for (const name of ['Authorization', 'X-Profile-Id', 'X-Profile-Token', 'X-Silo-Client-Family']) {
          if (headers.has(name)) scoped.set(name, headers.get(name));
        }
        session = { id, headers: scoped, epoch: localStorage.getItem('silo-profile-epoch') };
      }
    }
    return request(input, init);
  };

  async function thumbnail(path, signal) {
    if (!path) return '';
    try {
      const url = new URL(path, location.href);
      if (url.origin !== location.origin && url.protocol !== 'https:') return '';
      const response = await request(url, {
        signal, credentials: 'same-origin', referrerPolicy: 'no-referrer', redirect: 'error',
      });
      if (!response.ok) return '';
      const bitmap = await createImageBitmap(await response.blob());
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 480;
        canvas.height = 270;
        const scale = Math.max(canvas.width / bitmap.width, canvas.height / bitmap.height);
        const w = bitmap.width * scale, h = bitmap.height * scale;
        canvas.getContext('2d').drawImage(bitmap, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
        return canvas.toDataURL('image/jpeg', 0.8);
      } finally { bitmap.close(); }
    } catch { return ''; }
  }

  window.canapeyContinueWatching = async function () {
    const active = session;
    const current = () => active && profile() === active.id &&
      active.epoch === localStorage.getItem('silo-profile-epoch') && localStorage.getItem('refresh_token');
    if (!current()) return null;
    const signal = AbortSignal.timeout(6500);
    const read = async path => {
      const response = await request(path, { headers: active.headers, redirect: 'error', signal, cache: 'no-store' });
      if (!response.ok) throw Error('Silo row unavailable');
      return response.json();
    };
    const layout = await read('/api/v2/home/layout');
    const section = layout.sections.find(row => row.section_type === 'continue_watching');
    if (!section || !current()) return [];
    const row = await read('/api/v2/home/sections/' + encodeURIComponent(section.id) + '/items');
    const items = row.items.filter(item =>
      ['episode', 'movie'].includes(item.type) && typeof item.content_id === 'string' &&
      item.position_seconds > 0 && item.duration_seconds > item.position_seconds);
    const cards = await Promise.all(items.slice(0, 5).map(async item => ({
      id: item.content_id, title: item.title, series: item.series_title ?? '',
      season: item.season_number ?? null, episode: item.episode_number ?? null,
      percent: Math.max(1, Math.min(99, Math.round(100 * item.position_seconds / item.duration_seconds))),
      image: await thumbnail(item.backdrop_is_episode_still || !item.poster_is_episode_still
        ? item.backdrop_url || item.poster_url : item.poster_url || item.backdrop_url, signal),
    })));
    return current() ? cards : [];
  };
})();
