'use strict';
// The small windows (remake option B, docs/ui-reference/messages-2026-11): one family of clear windows.
// A decision card says what will happen and what stays safe, and names its buttons after the action.
// A progress card lists its steps. A trouble card starts with "your work is safe", then what you can
// do. Notices stack above the status bar and offer Undo where Ctrl+Z would take the change back.
const Messages = (() => {
  const ICONS = { danger: 'trash', question: 'help', info: 'backup', warn: 'warn', restore: 'history' };
  // Messages from the main process arrive as "Error invoking remote method 'x': Error: …": keep the …
  const clean = text =>
    String(text || '').replace(/^Error invoking remote method '[^']*': (?:\w*Error: )?/, '');
  const list = (items = []) => (items.length ? `<ul>${items.map(t => `<li>${t}</li>`).join('')}</ul>` : '');
  function open(kind, html) {
    const d = $('#dialog');
    d.classList.remove('large', 'msg-decide', 'msg-progress', 'msg-trouble');
    d.classList.add('msg', 'msg-' + kind);
    $('#dialog-content').innerHTML = html;
    if (!d.open) d.showModal();
  }
  const head = (kind, iconName, title, sub) =>
    `<div class="dialog-head msg-head"><span class="msg-ico ${kind}">${icon(iconName)}</span><div><h2>${E(title)}</h2>${sub ? `<p>${E(sub)}</p>` : '<p></p>'}</div><button data-action="close" aria-label="Close dialog">✕</button></div>`;

  // Decide: { title, sub, text, will: [], safe: [], body, confirm, keep, kind, submit, buttons }.
  // Text in will/safe is HTML (callers escape names). The confirm button keeps the id "confirm".
  function decide(o) {
    const kind = o.kind || 'question',
      cols =
        o.will || o.safe
          ? `<div class="msg-cols">${o.will ? `<div class="will"><b>Will happen</b>${list(o.will)}</div>` : ''}${o.safe ? `<div class="safe"><b>Stays safe</b>${list(o.safe)}</div>` : ''}</div>`
          : '';
    open(
      'decide',
      `${head(kind, o.icon || ICONS[kind] || 'help', o.title, o.sub)}<div class="dialog-body msg-body">${o.text ? `<p>${E(o.text)}</p>` : ''}${o.body || ''}${cols}<p id="dialog-error" class="dialog-error" role="alert"></p></div><div class="dialog-foot msg-foot"><kbd>Esc</kbd><span class="msg-hint">${E(o.escape || 'changes nothing')}</span><span class="spacer"></span>${
        o.buttons ||
        `<button data-action="close">${E(o.keep || 'Cancel')}</button><button class="primary ${kind === 'danger' ? 'danger-fill' : ''}" id="confirm">${kind === 'danger' ? icon('trash') : ''}${E(o.confirm || 'Continue')}</button>`
      }</div>`
    );
    const go = $('#confirm');
    if (go && o.submit)
      go.onclick = async () => {
        go.disabled = true;
        try {
          await o.submit();
          if ($('#dialog').open && $('#confirm') === go) closeDialog();
        } catch (e) {
          if ($('#dialog-error')) $('#dialog-error').textContent = e.message;
        } finally {
          go.disabled = false;
        }
      };
  }

  // Progress: { title, sub, steps: [], note, id }. Returns { step(n), close() }. Steps before n are
  // done, n runs, later ones wait. There is no made-up percentage: the bar only shows that work goes on.
  function progress(o) {
    const draw = n =>
      o.steps
        .map(
          (s, i) =>
            `<div class="${i < n ? 'done' : i === n ? 'now' : 'wait'}"><i>${i < n ? '✓' : ''}</i>${E(s)}</div>`
        )
        .join('');
    open(
      'progress',
      `${head('info', o.icon || 'backup', o.title, o.sub)}<div class="dialog-body msg-body"><div class="msg-steps" id="msg-steps">${draw(0)}</div><div class="msg-bar"><i></i></div><p class="hint" ${o.id ? `id="${o.id}"` : ''}>${E(o.note || 'Your work stays as it is while this runs.')}</p><p id="dialog-error" class="dialog-error" role="alert"></p></div>`
    );
    $('#dialog-content').dataset.progress = o.title;
    return {
      step(n) {
        const host = $('#msg-steps');
        if (host) host.innerHTML = draw(n);
      },
      close() {
        if ($('#dialog').open && $('#dialog-content').dataset.progress === o.title) closeDialog();
      }
    };
  }

  // Trouble: { title, cause, safe, todo: [], details, buttons } — your work first, then what to do.
  function trouble(o) {
    open(
      'trouble',
      `${head('warn', 'warn', o.title, clean(o.cause))}<div class="dialog-body msg-body"><div class="msg-safe"><b>Your work is safe</b>${E(o.safe || 'Nothing has been lost.')}</div>${o.todo?.length ? `<div class="msg-todo"><b>What you can do</b>${list(o.todo)}</div>` : ''}${o.details ? `<details class="msg-details"><summary>Details for support</summary><pre id="msg-details">${E(o.details)}</pre></details>` : ''}<p id="dialog-error" class="dialog-error" role="alert"></p></div><div class="dialog-foot msg-foot">${o.details ? `<button class="ghost" id="msg-copy">${icon('copy')}Copy details</button>` : ''}<span class="spacer"></span>${o.buttons || '<button class="primary" data-action="close">Close</button>'}</div>`
    );
    const copy = $('#msg-copy');
    if (copy)
      copy.onclick = () =>
        navigator.clipboard
          .writeText(o.details)
          .then(() => (copy.textContent = 'Copied'))
          .catch(() => (copy.textContent = 'Select the details and copy them'));
  }
  const detailsOf = e =>
    `${e?.message || e}\n${appVersion ? 'Decals ' + appVersion + ' · ' : ''}${navigator.platform}`;

  // Notices: the newest one is #toast. At most three stay; each fades after a while. "undo" adds an
  // Undo button that takes this change back, as long as nothing else changed since.
  function notice(text, opts = {}) {
    const host = $('#notices');
    const old = $('#toast');
    // A dismissed or empty newest notice goes; a visible one stays in the stack.
    if (old && (!old.textContent || old.dataset.gone)) old.remove();
    else if (old) old.removeAttribute('id');
    const el = document.createElement('div');
    el.id = 'toast';
    el.className = 'notice' + (opts.error ? ' error' : '');
    el.innerHTML = `<span class="dot"></span><span class="msg-text">${E(clean(text))}</span>`;
    const at = history.length;
    const button = (label, run, primary) => {
      const b = document.createElement('button');
      b.className = primary ? 'primary' : 'ghost';
      b.textContent = label;
      b.onclick = () => {
        try {
          run();
          gone(el);
        } catch (e) {
          fail(e);
        }
      };
      el.append(b);
    };
    if (opts.undo)
      button(
        'Undo',
        () => {
          if (history.length !== at)
            throw Error('Other changes came after this one. Ctrl+Z undoes them one at a time.');
          actions.undo();
        },
        true
      );
    if (opts.action) button(opts.action.label, opts.action.run);
    host.append(el);
    requestAnimationFrame(() => el.classList.add('visible'));
    const all = [...host.querySelectorAll('.notice')];
    for (const extra of all.slice(0, Math.max(0, all.length - 3))) extra.remove();
    const time = opts.error ? 6500 : opts.undo || opts.action ? 8000 : 3500;
    el.timer = setTimeout(() => gone(el), time);
    el.onmouseenter = () => clearTimeout(el.timer);
    el.onmouseleave = () => (el.timer = setTimeout(() => gone(el), 2500));
  }
  function gone(el) {
    clearTimeout(el.timer);
    el.dataset.gone = '1';
    el.classList.remove('visible');
    // The newest notice keeps its place as #toast (empty and hidden) until the next one arrives.
    setTimeout(() => {
      if (el.id !== 'toast') el.remove();
    }, 250);
  }
  return { decide, progress, trouble, notice, detailsOf, clean };
})();
