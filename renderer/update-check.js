// "A new version is available" (ported from SlotForge Paddock): a quiet notice in the top bar, plus an
// Updates section in App settings. The main process does the asking; Decals never installs anything.
// Loaded after app.js, whose actions, toast and $ helpers it uses.
const UpdateUI = (() => {
  let state = null,
    loading = false,
    again = false;
  const E = s =>
    String(s).replace(
      /[&<>"']/g,
      c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );
  const call = (action, payload) => desktop.updateCheck(action, payload);

  async function load() {
    // A change that arrives while loading is not lost: load once more afterwards.
    if (loading) return void (again = true);
    loading = true;
    try {
      state = await call('status');
    } catch {
      state = null; // The notice is optional; never block the app for it.
    } finally {
      loading = false;
    }
    show();
    if (again) {
      again = false;
      void load();
    }
  }

  function noticeHTML() {
    if (!state?.notify || !state.latest) return '';
    return `<span class="update-notice" role="status"><span class="un-text"><strong>Decals ${E(state.latest.version)} is available</strong><small>You have ${E(state.current)}. Your sheets and decals stay in Documents/SlotForge Decals.</small></span><button class="primary" data-action="update-open">Download</button><button data-action="update-skip" title="Hide until a newer version appears">Not now</button></span>`;
  }

  function settingsHTML() {
    const s = state;
    if (!s) return '<p class="hint">Loading…</p>';
    const newest = s.checking
      ? 'Checking…'
      : s.latest
        ? `Version ${s.latest.version} is available`
        : s.upToDate
          ? 'You have the latest version'
          : 'Not checked yet';
    const how = !s.enabled
      ? 'Off: Decals only checks when you click Check now.'
      : s.automatic
        ? 'Decals checks shortly after it starts, at most twice a day, and shows a notice in the top bar.'
        : 'This copy only checks when you click Check now.';
    const when = s.lastCheck
      ? new Date(s.lastCheck).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
      : 'Never';
    const row = (name, desc, control) =>
      `<div class="ss-row"><div class="ss-t"><b>${name}</b>${desc ? `<span class="ss-desc">${desc}</span>` : ''}</div><div class="ss-c">${control}</div></div>`;
    return (
      '<div class="ss-sheet">' +
      row(
        `This version <span class="ss-mono">${E(s.current)}</span>`,
        `Newest: <span id="update-newest">${E(newest)}</span> · Last checked: ${E(when)}`,
        `${s.latest ? `<button class="primary" data-action="update-open">Download ${E(s.latest.version)}</button>` : ''}<button data-action="update-check" ${s.checking ? 'disabled' : ''}>Check now</button>`
      ) +
      (s.automatic
        ? row(
            'Check automatically',
            E(how),
            `<input type="checkbox" class="ss-switch" data-action="update-toggle" aria-label="${s.enabled ? 'Turn off automatic checks' : 'Turn on automatic checks'}" ${s.enabled ? 'checked' : ''}>`
          )
        : '') +
      '</div>' +
      (s.lastError && !s.checking ? `<p class="hint update-error">${E(s.lastError)}</p>` : '') +
      `<p class="ss-note">${s.automatic ? '' : E(how) + ' '}It only asks GitHub for the newest version number; nothing about you or your sheets is sent. Decals never downloads or installs anything by itself.</p>` +
      (s.latest
        ? '<p class="ss-note">Download opens the release page in your browser. Close Decals, then install the new version as before; your sheets and decals stay in Documents/SlotForge Decals.</p>'
        : '')
    );
  }

  // Updates only these two spots, never the sheet being edited.
  function show() {
    const bar = document.querySelector('.projectbar');
    if (bar) {
      const html = noticeHTML(),
        old = bar.querySelector('.update-notice');
      if ((old?.outerHTML || '') !== html) {
        old?.remove();
        if (html) bar.insertAdjacentHTML('afterbegin', html);
      }
    }
    const box = document.querySelector('#update-settings');
    if (box) box.innerHTML = settingsHTML();
    const rail = document.querySelector('#rail-status-updates');
    if (rail && state)
      rail.textContent = `${state.current} · ${state.latest ? state.latest.version + ' available' : state.enabled && state.automatic ? 'automatic' : 'manual'}`;
  }

  const actions = {
    'update-open': () => call('open'),
    'update-skip': async () => {
      state = await call('skip', { version: state?.latest?.version });
      show();
      toast('Decals will remind you when a newer version appears. App settings → Updates has the download.');
    },
    'update-check': () => {
      // Not awaited: a slow network must not hold up other buttons; the status event redraws.
      call('check').then(
        s => {
          state = s;
          show();
          toast(s.latest ? `Version ${s.latest.version} is available.` : 'You have the latest version.');
        },
        e => {
          toast(e.message, true);
          void load();
        }
      );
    },
    'update-toggle': async () => {
      state = await call('enable', { enabled: !state?.enabled });
      show();
    }
  };

  desktop.onUpdateStatus(() => void load());
  void load();
  return { show, load, actions };
})();
Object.assign(actions, UpdateUI.actions);
