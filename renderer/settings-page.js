'use strict';
// The Settings page (remake option A, docs/ui-reference/settings-2026-11): Settings as cards you
// can see, Help as short how-tos with instant answers (the full topics one click away), and Fonts:
// the fonts embedded in this sheet and the ones on this computer, shown in your own text.
const SettingsPage = (() => {
  const TABS = ['settings', 'help', 'fonts'];
  let tab = 'settings',
    topic = 0,
    reading = null, // index of the help topic shown in full
    query = '',
    sample = '',
    fontFilter = 'all',
    fontQuery = '',
    computerFonts = null,
    fontError = '';
  const root = () => document.getElementById('settings-page');
  const isOpen = () => !!root() && !root().hidden;
  const ago = iso => {
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return null;
    const d = Math.floor((Date.now() - t) / 864e5);
    return d <= 0 ? 'today' : d === 1 ? 'yesterday' : d + ' days ago';
  };
  const days = iso => (Number.isFinite(Date.parse(iso)) ? (Date.now() - Date.parse(iso)) / 864e5 : Infinity);

  // Short how-tos: three steps each and a "Show me" that goes to the place it describes.
  const HOW = [
    [
      0,
      'Your first sheet',
      '2 min',
      [
        'Open the <b>Workshop</b>.',
        'Start a <b>blank sheet</b> on your paper.',
        'Import a logo, then <b>Export PDF</b>.'
      ],
      () => actions.projects()
    ],
    [
      1,
      'Find any tool',
      '1 min',
      ['Press <b>Ctrl+K</b>.', 'Type what you want: “stripe”, “white ink”…', 'Press Enter to use it.'],
      () => (hide(), Finder.open())
    ],
    [
      2,
      'Bring in a logo',
      '2 min',
      [
        '<b>Image</b> on the tool rail, or drop a file on the sheet.',
        'Clean up or trace it in the import bay.',
        'Set its size in millimetres.'
      ],
      () => (hide(), actions.import())
    ],
    [
      3,
      'Text on the sheet',
      '1 min',
      [
        '<b>Text</b> on the tool rail; pick a style.',
        'Click the sheet and type.',
        'Enter when you are done.'
      ],
      () => (hide(), MakeTools.show('text'))
    ],
    [
      3,
      'A whole field of numbers',
      '2 min',
      [
        '<b>Number</b> on the tool rail.',
        'Type 1-30, 44 in <b>More numbers</b>.',
        '<b>Add in free space</b>.'
      ],
      () => (hide(), MakeTools.show('number'))
    ],
    [
      4,
      'Check the size on the car',
      '1 min',
      ['Open the <b>Car</b> page.', 'Drag a decal onto the car.', 'Resize it by a corner.'],
      () => CarPage.show()
    ],
    [
      5,
      'Repeat a decal',
      '1 min',
      ['Select it; <b>Repeat</b> above it.', 'Set columns, rows and gaps.', '<b>Add copies</b>.'],
      () => (hide(), LayoutTab.show('repeat'))
    ],
    [
      5,
      'Tidy the sheet',
      '1 min',
      ['<b>Arrange</b> on the tool rail.', 'Check the before and after.', '<b>Arrange</b>.'],
      () => (hide(), LayoutTab.show('pack'))
    ],
    [
      6,
      'Save part of a sheet',
      '2 min',
      ['<b>Slice</b> on the tool rail.', 'Draw the area.', 'Save it as a decal or a PDF.'],
      () => (hide(), actions.slice())
    ],
    [
      7,
      'Keep a decal for later',
      '1 min',
      [
        'Select it: <b>Save to library</b>.',
        'Give it a name and tags.',
        'Find it in the <b>Decal Library</b>.'
      ],
      () => Shelf.show()
    ],
    [
      7,
      'Send a sheet to a friend',
      '1 min',
      [
        '<b>Print &amp; share</b> → Share &amp; back up.',
        '<b>Share sheets…</b>',
        'Send them the .sfsheet file.'
      ],
      () => PrintPage.show('share')
    ],
    [
      8,
      'Your first test print',
      '2 min',
      ['<b>Print &amp; share</b> → Test print.', 'Print at <b>100 %</b> on plain paper.', 'Measure the bar.'],
      () => PrintPage.show('proof')
    ],
    [
      8,
      'White ink on clear paper',
      '3 min',
      ['<b>Print on decal paper</b>.', 'Turn on <b>white ink</b>.', 'Check the hatched preview.'],
      () => PrintPage.show('print')
    ],
    [
      9,
      'Fix what the checks find',
      '1 min',
      [
        '<b>Print &amp; share</b> → Check the sheet.',
        'Use the fix next to each problem.',
        'Ctrl+Z if you change your mind.'
      ],
      () => PrintPage.show('check')
    ],
    [
      9,
      'Cut with a machine',
      '3 min',
      ['<b>Cut out</b>: pick your machine.', 'Choose a folder.', 'Open INSTRUCTIONS.txt.'],
      () => PrintPage.show('cut')
    ],
    [
      10,
      'Get the newest version',
      '1 min',
      ['<b>Settings</b> → Updates.', 'Check now.', 'Install when it is ready.'],
      () => show('settings')
    ]
  ];

  function show(to = 'settings') {
    try {
      CanvasTools.resolve();
    } catch (e) {
      fail(e);
      return;
    }
    Workshop.hide();
    Shelf.hide();
    CarPage.hide();
    PrintPage.hide();
    closeDialog();
    tab = TABS.includes(to) ? to : 'settings';
    if (tab === 'fonts' && !sample)
      sample = current()?.kind === 'text' ? current().text.trim().slice(0, 24) : '';
    root().hidden = false;
    document.body.classList.add('settingspage-mode');
    for (const b of $$('.wb-nav .nav')) b.classList.remove('active');
    Finder.close();
    render();
    if (tab === 'fonts') loadComputerFonts();
  }
  function hide() {
    if (!isOpen()) return;
    // The update section is shared with the update window: take it out before clearing the page.
    if (updateCard?.isConnected) updateCard.remove();
    root().hidden = true;
    root().innerHTML = '';
    document.body.classList.remove('settingspage-mode');
    for (const b of $$('.wb-nav .nav')) b.classList.toggle('active', b.dataset.action === 'editor');
    renderPaper();
  }

  function settingsTab() {
    const last = ago(settings.lastBackup),
      stale = days(settings.lastBackup) > 14;
    const theme = (k, label, bg, a, b) =>
      `<button class="sp-theme" data-sp-theme="${k}" aria-pressed="${settings.theme === k}"><span class="scr" style="background:${bg}"><i style="background:${a}"></i><i style="background:${b}"></i><i style="background:${a}"></i></span><b>${label}</b></button>`;
    const start = settings.startOnWorkshop !== false;
    return `<div class="sp-grid">
      <article class="sp-card"><h3>Look</h3><div class="sp-two">${theme('dark', 'Dark', '#14181e', '#1d232b', '#101318')}${theme('light', 'Light', '#f1efea', '#ffffff', '#e4e1da')}</div><p>Sheets always print the same, whichever you pick.</p></article>
      <article class="sp-card"><h3>When Decals opens</h3><div class="sp-two"><button class="sp-start" data-sp-start="workshop" aria-pressed="${start}"><span class="pv many"><i></i><i></i><i></i><i></i></span><b>The Workshop</b><small>Your sheets and a way to continue</small></button><button class="sp-start" data-sp-start="editor" aria-pressed="${!start}"><span class="pv"><i></i></span><b>The editor</b><small>Straight into the open sheet</small></button></div><label class="switch-row" hidden><input id="start-workshop" type="checkbox" role="switch" ${start ? 'checked' : ''}><span class="sw" aria-hidden="true"></span>Start on the Workshop</label></article>
      <article class="sp-card"><h3>Backups</h3><div class="sp-status ${stale ? 'warn' : ''}" id="sp-backup-status">${icon('backup')}<div><b>${last ? 'Last backup ' + last : 'No backup made yet'}</b><small>${stale ? 'A complete backup keeps every sheet, the library and all fonts safe.' : 'Everything up to then is safe in that file.'}</small></div></div><div class="sp-line"><button class="primary" data-alias="complete-backup">${icon('up')}Back up now…</button><button data-alias="complete-restore">Restore…</button></div><label class="switch-row"><input id="sp-remind" type="checkbox" role="switch" ${settings.backupReminder !== false ? 'checked' : ''}><span class="sw" aria-hidden="true"></span>Remind me after two weeks</label></article>
      <article class="sp-card wide"><h3>Your workspace</h3><div class="sp-path">${E(rootPath)}</div><div class="ss-stats sp-stats" id="storage-usage" role="status"><span class="hint">Reading storage usage…</span></div><div class="sp-line"><button data-alias="folder">${icon('workspace')}Open the folder</button><span class="spacer"></span><span class="sp-note">Installing a new version never touches this folder. Three earlier workspace versions are kept inside the database.</span></div></article>
      <article class="sp-card"><h3>Get a sheet back</h3><p>Every save is kept as history. Deleted sheets wait in the Workshop.</p><div class="sp-line"><button data-alias="recover-workspace">${icon('history')}Recover a sheet…</button></div><details class="settings-advanced" id="legacy-backups"><summary>Older backup format (.sfbackup)</summary><p class="sp-note">Only for exchanging with older Decals versions. Contains the current sheet and up to 1,000 library decals, not every saved sheet.</p><div class="sp-line"><button data-alias="backup">Export Workspace Backup</button><button data-alias="restore-backup">Restore Workspace Backup</button></div></details></article>
      <article class="sp-card wide"><h3>Updates</h3><p class="sp-status-line" id="rail-status-updates"></p><div id="update-settings"></div><p>Only the version number is fetched. Your artwork never leaves this computer.</p></article>
    </div>`;
  }
  function stats() {
    desktop
      .storageStats()
      .then(s => {
        const el = $('#storage-usage');
        if (!el) return;
        const mb = (s.bytes / 1024 / 1024).toFixed(1) + ' MB';
        el.innerHTML = [
          ['Database', mb],
          ['Saved sheets', s.sheets],
          ['Saved decals', s.decals],
          ['Artwork', s.assets],
          ['Saved versions', s.history]
        ]
          .map(([k, v]) => `<div class="ss-stat"><small>${k}</small><b>${E(String(v))}</b></div>`)
          .join('');
      })
      .catch(fail);
  }

  function helpTab() {
    const q = query.trim().toLowerCase();
    const text = n => (HELP_TOPICS[n][0] + ' ' + HELP_TOPICS[n][1].replace(/<[^>]+>/g, ' ')).toLowerCase();
    const recipeText = r => (r[1] + ' ' + r[3].join(' ').replace(/<[^>]+>/g, ' ')).toLowerCase();
    const recipes = HOW.map((r, n) => ({ r, n })).filter(({ r }) =>
      q ? recipeText(r).includes(q) : r[0] === topic
    );
    const answers = q ? HELP_TOPICS.map((_, n) => n).filter(n => text(n).includes(q)) : [];
    const card = ({ r, n }) =>
      `<article class="sp-how"><header><h3>${r[1]}</h3><span class="spacer"></span><span class="sp-chip">${r[2]}</span></header><ol>${r[3].map(s => `<li>${s}</li>`).join('')}</ol><div class="sp-line"><button data-sp-show="${n}">${icon('search')}Show me</button><button class="ghost" data-sp-read="${r[0]}">Read more</button></div></article>`;
    const reader =
      reading !== null
        ? `<section class="sp-reader" id="sp-reader"><header><h2>${E(HELP_TOPICS[reading][0])}</h2><span class="spacer"></span><button class="ghost" data-sp-close-read>${icon('x')}Close</button></header><div class="help-topic">${HELP_TOPICS[reading][1]}</div></section>`
        : '';
    return `<div class="sp-help"><aside class="sp-hside"><label class="sp-search">${icon('search')}<input id="help-search" type="search" placeholder="Search help: white ink, numbers…" value="${E(query)}" aria-label="Search help"></label>${
      q
        ? `<div class="sp-answers">${answers.length ? answers.map(n => `<button class="sp-answer" data-sp-read="${n}"><b>${E(HELP_TOPICS[n][0])}</b><small>Read the topic</small></button>`).join('') : '<p class="sp-note">No topic mentions that. Try another word.</p>'}</div>`
        : ''
    }<h4>Topics</h4><div class="sp-chips">${HELP_TOPICS.map((t, n) => `<button class="sp-chip" data-sp-topic="${n}" aria-pressed="${!q && n === topic}">${E(t[0])}</button>`).join('')}</div><p class="sp-note">SlotForge Decals${appVersion ? ' · ' + E(appVersion) : ''}</p></aside>
      <div class="sp-hmain">${reader}<header class="sp-hhead"><h2>${q ? 'Matching how-tos' : E(HELP_TOPICS[topic][0])}</h2><span class="spacer"></span><span class="sp-note">${recipes.length} ${recipes.length === 1 ? 'how-to' : 'how-tos'}</span>${q ? '' : `<button class="ghost" data-sp-read="${topic}">The whole topic</button>`}</header>${
        recipes.length
          ? `<div class="sp-hows">${recipes.map(card).join('')}</div>`
          : `<div class="help-topic sp-inline">${HELP_TOPICS[topic][1]}</div>`
      }</div></div>`;
  }

  // Fonts: what this sheet embeds (and which ones nothing uses any more), and the computer's fonts.
  function fontsTab() {
    const text = current()?.kind === 'text' && !current().locked ? current() : null,
      words = E(sample || text?.text.trim().slice(0, 24) || 'Race 27'),
      used = new Set(DM.fontsFor(project.items, project.fonts).map(f => f.family));
    const uses = family => {
      let n = 0;
      const walk = list => {
        for (const i of list) {
          if (i.kind === 'text' && i.font === family) n++;
          if (i.children) walk(i.children);
        }
      };
      walk(project.items);
      return n;
    };
    const css = f => `font-family:&quot;${E(String(f).replace(/["\\]/g, ''))}&quot;, sans-serif`;
    const sheet = project.fonts
      .map(f => {
        const n = uses(f.family),
          live = used.has(f.family);
        return `<div class="sp-font" data-sp-sheet-font="${E(f.family)}"><span class="sp-sample" style="${css(f.family)}">${words}</span><div class="sp-fmeta"><b>${E(f.name || f.family)}</b><small>${live ? (n ? `${n} ${n === 1 ? 'text' : 'texts'} on this sheet` : 'Used inside artwork') : 'Not used any more'}</small>${live ? '<span class="sp-tag">EMBEDDED</span>' : `<button class="ghost" data-sp-font-remove="${E(f.family)}">${icon('trash')}Remove</button>`}</div></div>`;
      })
      .join('');
    const builtIn = ['Arial', 'Georgia', 'Verdana', 'Courier New']
      .map(
        f =>
          `<div class="sp-font"><span class="sp-sample" style="${css(f)}">${words}</span><div class="sp-fmeta"><b>${f}</b><small>Included with Decals</small>${text ? `<button data-sp-use-builtin="${f}">Use for the text</button>` : ''}</div></div>`
      )
      .join('');
    const filters = {
      all: () => true,
      bold: f => /bold|black|heavy|impact/i.test(f),
      condensed: f => /condensed|narrow|compressed/i.test(f),
      script: f => /script|hand|brush|signature/i.test(f)
    };
    const matches = (computerFonts || []).filter(
      f => filters[fontFilter](f.family) && f.family.toLowerCase().includes(fontQuery.toLowerCase())
    );
    const computer = fontError
      ? `<p class="sp-note warn">${E(fontError)}</p>`
      : !computerFonts
        ? '<p class="sp-note">Reading the fonts on this computer…</p>'
        : `<div class="sp-flist" id="font-list">${
            matches
              .slice(0, 120)
              .map(
                f =>
                  `<button class="sp-font font-option" data-font-family="${E(f.family)}" ${text ? '' : 'disabled'}><span class="sp-sample" style="${css(f.family)}">${words}</span><small>${E(f.family)}</small></button>`
              )
              .join('') || '<p class="sp-note">No fonts on this computer match.</p>'
          }</div>${matches.length > 120 ? `<p class="sp-note pad">Showing 120 of ${matches.length}. Search to find the rest.</p>` : ''}`;
    return `<div class="sp-fonts-top"><label class="sp-search wide">${icon('text')}<input id="sp-sample" value="${E(sample)}" placeholder="${text ? E(text.text.trim().slice(0, 24)) : 'Type your own text'}" aria-label="Sample text" maxlength="40"></label><span class="sp-note">${text ? `Choosing a font changes “${E(text.name)}”.` : 'Select a text decal in the Editor to change its font from here.'}</span><span class="spacer"></span><button data-alias="font">${icon('down')}Add a font file…</button></div>
      <div class="sp-fgrid"><article class="sp-card flush"><header class="sp-fhead"><h3>In this sheet</h3><span class="sp-note">Embedded: PDFs and shared sheets keep them</span></header>${sheet || '<p class="sp-note pad">No fonts embedded yet. Fonts you choose from this computer or add as a file are embedded here.</p>'}<header class="sp-fhead"><h3>Included with Decals</h3></header>${builtIn}</article>
      <article class="sp-card flush"><header class="sp-fhead"><h3>On this computer</h3><span class="spacer"></span><div class="seg" role="group" aria-label="Kind">${[
        ['all', 'All'],
        ['bold', 'Bold'],
        ['condensed', 'Condensed'],
        ['script', 'Script']
      ]
        .map(([k, l]) => `<button data-sp-filter="${k}" aria-pressed="${fontFilter === k}">${l}</button>`)
        .join(
          ''
        )}</div></header><div class="sp-pad"><input id="font-search" type="search" placeholder="Search fonts…" value="${E(fontQuery)}" aria-label="Search installed fonts"></div>${computer}<p class="sp-note pad">Only share sheets with fonts whose licence allows embedding.</p><p class="sp-error" id="sp-font-error" role="alert"></p></article></div>`;
  }
  function loadComputerFonts() {
    if (computerFonts || fontError) return;
    installedFonts()
      .then(list => {
        computerFonts = list;
        if (isOpen() && tab === 'fonts') render();
      })
      .catch(e => {
        fontError = e.message;
        if (isOpen() && tab === 'fonts') render();
      });
  }

  function render() {
    if (!isOpen()) return;
    // Keep a field being typed in: the lists below it refresh, the field stays.
    const active = document.activeElement,
      typing = root().contains(active) && active.matches('input[type=search], #sp-sample') ? active.id : null,
      caret = typing ? active.selectionStart : 0;
    if (updateCard?.isConnected) updateCard.remove();
    const body = { settings: settingsTab, help: helpTab, fonts: fontsTab }[tab]();
    root().innerHTML = `<header class="sp-tabs" role="tablist">${[
      ['settings', 'Settings'],
      ['help', 'Help'],
      ['fonts', 'Fonts']
    ]
      .map(([k, l]) => `<button role="tab" data-sp-tab="${k}" aria-selected="${tab === k}">${l}</button>`)
      .join(
        ''
      )}<span class="spacer"></span><span class="sp-note">SlotForge Decals${appVersion ? ' ' + E(appVersion) : ''}</span><button class="ghost" data-sp-done>${icon('x')}Close</button></header><div class="sp-body">${body}</div>`;
    if (tab === 'settings') {
      if (updateCard) $('#update-settings').append(updateCard);
      updateRail();
      stats();
    }
    if (typing && $('#' + typing)) {
      const el = $('#' + typing);
      el.focus();
      el.setSelectionRange?.(caret, caret);
    }
  }

  async function useFont(family) {
    const text = current();
    if (text?.kind !== 'text' || text.locked)
      throw Error('Select an unlocked text decal in the Editor first.');
    const entry = computerFonts.find(f => f.family === family);
    const font = await fontFromBlob(await entry.face.blob(), entry.face.fullName || entry.family);
    await Art.loadFonts([...activeFonts(), font]);
    mutate(() => {
      const live = project.items.find(x => x.id === text.id);
      if (!live) throw Error('The text decal is no longer on this sheet.');
      if (!project.fonts.includes(font)) project.fonts.push(font);
      live.font = font.family;
      remeasureText(live);
    });
    toast(`${entry.family} embedded in this sheet.`);
  }
  document.addEventListener('click', e => {
    if (!isOpen() || !root().contains(e.target)) return;
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    const run = fn =>
      Promise.resolve()
        .then(fn)
        .catch(err => {
          if ($('#sp-font-error')) $('#sp-font-error').textContent = err.message;
          else fail(err);
        });
    if (b.dataset.spTab) {
      tab = b.dataset.spTab;
      render();
      if (tab === 'fonts') loadComputerFonts();
      return;
    }
    if (b.dataset.spDone !== undefined) return actions.editor();
    if (b.dataset.spTheme) {
      setTheme(b.dataset.spTheme);
      return render();
    }
    if (b.dataset.spStart) {
      settings.startOnWorkshop = b.dataset.spStart === 'workshop';
      revision++;
      scheduleSave();
      return render();
    }
    if (b.dataset.spTopic) {
      topic = Number(b.dataset.spTopic);
      query = '';
      reading = null;
      return render();
    }
    if (b.dataset.spRead) {
      reading = Number(b.dataset.spRead);
      render();
      return $('#sp-reader')?.scrollIntoView({ block: 'start' });
    }
    if (b.dataset.spCloseRead !== undefined) {
      reading = null;
      return render();
    }
    if (b.dataset.spShow) return run(() => HOW[Number(b.dataset.spShow)][4]());
    if (b.dataset.spFilter) {
      fontFilter = b.dataset.spFilter;
      return render();
    }
    if (b.dataset.spFontRemove)
      return run(() => {
        const family = b.dataset.spFontRemove;
        if (DM.fontsFor(project.items, project.fonts).some(f => f.family === family))
          throw Error('This font is still used on the sheet.');
        mutate(() => (project.fonts = project.fonts.filter(f => f.family !== family)));
        toast('Font removed from this sheet.');
      });
    if (b.dataset.spUseBuiltin)
      return run(() => {
        const text = current();
        if (text?.kind !== 'text' || text.locked) throw Error('Select an unlocked text decal first.');
        mutate(() => {
          text.font = b.dataset.spUseBuiltin;
          remeasureText(text);
        });
      });
    if (b.dataset.fontFamily) {
      for (const x of $$('#font-list button')) x.disabled = true;
      return run(() => useFont(b.dataset.fontFamily)).finally(() => isOpen() && render());
    }
  });
  document.addEventListener('input', e => {
    if (!isOpen() || !root().contains(e.target)) return;
    if (e.target.id === 'help-search') query = e.target.value;
    else if (e.target.id === 'sp-sample') sample = e.target.value;
    else if (e.target.id === 'font-search') fontQuery = e.target.value;
    else return;
    render();
  });
  document.addEventListener('change', e => {
    if (!isOpen() || !root().contains(e.target)) return;
    if (e.target.id === 'sp-remind') {
      settings.backupReminder = e.target.checked;
      revision++;
      scheduleSave();
    }
    if (e.target.id === 'start-workshop') {
      settings.startOnWorkshop = e.target.checked;
      revision++;
      scheduleSave();
    }
  });
  document.addEventListener('keydown', e => {
    // Font changes are sheet edits: undo and redo work here too.
    if (
      isOpen() &&
      (e.ctrlKey || e.metaKey) &&
      !e.target.matches('input,textarea,select') &&
      !document.querySelector('dialog[open]')
    ) {
      const key = e.key.toLowerCase();
      if (key === 'z' || key === 'y') {
        e.preventDefault();
        actions[key === 'y' || e.shiftKey ? 'redo' : 'undo']();
        return;
      }
    }
    if (isOpen() && e.key === 'Escape' && !document.querySelector('dialog[open]')) {
      if (reading !== null) {
        reading = null;
        render();
      } else actions.editor();
    }
  });
  // A complete backup was saved: remember when, for the Backups card and the reminder.
  function backedUp() {
    settings.lastBackup = new Date().toISOString();
    revision++;
    scheduleSave();
    render();
  }
  // At start: a gentle reminder once a backup is more than two weeks old.
  function remind() {
    if (settings.backupReminder === false || !settings.lastBackup || days(settings.lastBackup) <= 14) return;
    toast(`Your last complete backup is ${ago(settings.lastBackup)}. Settings → Backups makes a new one.`);
  }
  return {
    show,
    hide,
    isOpen,
    render,
    backedUp,
    remind,
    get tab() {
      return tab;
    }
  };
})();
