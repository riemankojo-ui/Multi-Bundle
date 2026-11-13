/* Multi Bundle - Project page: tap a project card to open a clean page with actions, settings and a safe delete. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var view = $('projectDetailView'), cards = $('projectCards');
  if (!view || window.__mbProjPage) return;
  window.__mbProjPage = true;

  function toast(m, t) { if (window.showToast) window.showToast(m, t); }
  function h(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function ico(d, col) { return '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="' + (col || 'currentColor') + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>'; }
  function nm(p) { return String(p).split('/').pop(); }
  function fx(p) { return (String(p).split('.').pop() || '').toLowerCase(); }
  function fs(n) { n = n || 0; return n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(1) + ' MB'; }

  var st = document.createElement('style');
  st.textContent = '.pp-top{display:flex;align-items:center;gap:12px;margin-top:14px}.pp-ico{width:48px;height:48px;border-radius:50%;background:#2a2c34;color:#cfd0d8;display:grid;place-items:center;font-weight:800;font-size:15px;flex:none;overflow:hidden}.pp-ico img{width:100%;height:100%;object-fit:cover;display:block}.pp-name{font-size:20px;font-weight:800;color:#fff;overflow-wrap:anywhere;margin:0}.pp-sub{font-size:13px;color:#8f919b;overflow-wrap:anywhere;margin-top:2px}.pp-chips{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0}.pp-chip{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border:1px solid #2a2b32;border-radius:999px;background:#101115;color:#cfd0d8;font-size:12px;font-weight:600}.pp-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.pp-btn{padding:13px 10px;border-radius:10px;border:1px solid #2e2f37;background:transparent;color:#e6e6e8;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer}.pp-btn.main{background:#ededed;color:#0a0a0a;border-color:#ededed}.pp-row{display:flex;align-items:center;gap:10px;padding:13px 0;border-bottom:1px solid #1e1f25}.pp-row:last-child{border-bottom:0}.pp-k{width:84px;flex:none;font-size:12px;color:#8f919b}.pp-v{flex:1;min-width:0;font-size:14px;color:#fff;overflow-wrap:anywhere}.pp-mini{flex:none;padding:7px 12px;border-radius:8px;border:1px solid #2e2f37;background:#1c1d22;color:#e6e6e8;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer}.pp-danger{border-color:#4a1d22!important}.pp-in{width:100%;box-sizing:border-box;padding:12px;border-radius:10px;border:1px solid #2e2f37;background:#0f1013;color:#fff;font-family:inherit;font-size:14px;margin:12px 0}.pp-del{width:100%;padding:13px;border-radius:10px;border:0;background:#f01424;color:#fff;font-family:inherit;font-size:14px;font-weight:800;cursor:pointer}.pp-del:disabled{opacity:.35}';
  document.head.appendChild(st);

  function copy(text) {
    function fallback() {
      try { var t = document.createElement('textarea'); t.value = text; t.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); toast('Copied', 'success'); }
      catch (e) { toast('Could not copy', 'error'); }
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(function () { toast('Copied', 'success'); }, fallback); return; }
    } catch (e) {}
    fallback();
  }
  function norm(s) { return String(s || '').trim().replace(/\/+$/, '').replace(/\.git$/i, '').replace(/^https?:\/\/(www\.)?github\.com\//i, '').toLowerCase(); }
  function match(p, v) { return p.githubRepo ? norm(v) === p.githubRepo.toLowerCase() : String(v || '').trim() === (p.name || ''); }

  function iconHtml(p) {
    try {
      if (p.logo && p.files) {
        var lf = p.files.find(function (f) { return f.path === p.logo; });
        if (lf) { var u = URL.createObjectURL(fileBlob(lf)); if (typeof urls !== 'undefined') urls.push(u); return '<div class="pp-ico"><img src="' + u + '" alt=""></div>'; }
      }
    } catch (e) {}
    return '<div class="pp-ico">' + h((p.name || '?').slice(0, 2).toUpperCase()) + '</div>';
  }
  function row(k, v, btns) { return '<div class="pp-row"><div class="pp-k">' + k + '</div><div class="pp-v">' + v + '</div>' + (btns || '') + '</div>'; }
  function mini(act, label) { return '<button class="pp-mini" data-pp="' + act + '">' + label + '</button>'; }

  async function removeLocal(id) {
    await dbDeleteProject(id);
    try { await __flushProjects(); } catch (e) {}
    if (currentProjectId === id) {
      currentProjectId = null; files = []; setCurrentProjectName('No project loaded');
      try { localStorage.removeItem('mb_active_project'); } catch (e) {}
    }
    await renderProjectCards();
    if (typeof render === 'function') render();
  }
  async function removeAll(p, btn, input) {
    var old = btn.textContent;
    btn.disabled = true; btn.textContent = 'Deleting...';
    function undo() { btn.textContent = old; btn.disabled = !match(p, input.value); }
    if (p.githubRepo) {
      var t = window.getToken ? window.getToken() : '';
      if (!t) { toast('Connect with GitHub first, then try again', 'error'); undo(); return; }
      var r;
      try { r = await fetch('https://api.github.com/repos/' + p.githubRepo, { method: 'DELETE', headers: { Authorization: 'Bearer ' + t, Accept: 'application/vnd.github+json' } }); }
      catch (e) { toast('No connection. Nothing was deleted.', 'error'); undo(); return; }
      if (r.status !== 204) {
        var msg = ''; try { msg = (await r.json()).message || ''; } catch (e) {}
        var hint = (r.status === 403 || r.status === 404) ? ' GitHub may need the delete permission: sign out in the GitHub tab, then tap Connect with GitHub again and allow it.' : '';
        if (window.showInfo) window.showInfo('GitHub did not delete it', 'GitHub said: ' + (msg || ('error ' + r.status)) + '. Nothing was deleted.' + hint);
        else toast('GitHub did not delete it', 'error');
        undo(); return;
      }
    }
    await removeLocal(p.id);
    toast('Project deleted', 'success');
    if (typeof showProjectsList === 'function') showProjectsList();
  }

  function build(p) {
    var repo = p.githubRepo || '', link = repo ? 'https://github.com/' + repo : '', n = files.length;
    var chip1 = repo
      ? '<span class="pp-chip">' + ico('<line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>') + h(p.githubBranch || 'main') + '</span>'
      : '<span class="pp-chip">' + ico('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>') + 'This phone</span>';
    view.innerHTML =
      '<section class="card">' +
        '<button id="ppBack" class="btn secondary">← All projects</button>' +
        '<div class="pp-top">' + iconHtml(p) + '<div style="min-width:0"><h2 class="pp-name" id="detailProjectName">' + h(p.name || 'Untitled') + '</h2><div class="pp-sub">' + h(repo || 'Local project') + '</div></div></div>' +
        '<div class="pp-chips">' + chip1 + '<span class="pp-chip">' + n + ' file' + (n === 1 ? '' : 's') + '</span><span class="pp-chip">' + h(timeAgo(p.savedAt)) + '</span></div>' +
        '<div class="pp-grid"><button id="ppPrev" class="pp-btn main">Preview</button><button id="ppEdit" class="pp-btn">Edit code</button><button id="ppBundle" class="pp-btn">Bundle</button><button id="ppImport" class="pp-btn">Import changes</button></div>' +
      '</section>' +
      '<section class="card"><div class="heading"><label class="eyebrow">PROJECT SETTINGS</label></div>' +
        row('Name', h(p.name || 'Untitled'), mini('rename', 'Rename')) +
        row('GitHub', repo ? h(repo) : 'Not linked', repo ? mini('copylink', 'Copy') + mini('openlink', 'Open') : '') +
        row('Branch', h(p.githubBranch || (repo ? 'main' : '—'))) +
        row('Created', p.createdAt ? h(new Date(p.createdAt).toLocaleDateString()) : '—') +
        row('Last saved', h(timeAgo(p.savedAt))) +
        row('Files', n + ' file' + (n === 1 ? '' : 's')) +
      '</section>' +
      '<section class="card"><div class="heading"><label class="eyebrow">FILES</label></div><div id="detailFileList" class="filelist"></div></section>' +
      '<section class="card pp-danger">' +
        '<div class="heading"><div><label class="eyebrow" style="color:#ff6b75">DANGER ZONE</label><h2>Delete project</h2></div></div>' +
        '<p class="note">' + (repo ? 'This permanently deletes the GitHub repository <b>' + h(repo) + '</b> and removes the project from this app. It cannot be undone.' : 'This removes the project from this app. It cannot be undone.') + '</p>' +
        '<button id="ppCopy" class="pp-mini" style="margin-top:10px">' + (repo ? 'Copy project link' : 'Copy project name') + '</button>' +
        '<input id="ppConfirm" class="pp-in" type="text" placeholder="' + (repo ? 'Paste the project link here' : 'Type the project name here') + '" autocomplete="off" autocapitalize="off" spellcheck="false">' +
        '<button id="ppDelete" class="pp-del" disabled>Delete project</button>' +
        (repo ? '<button id="ppLocal" class="pp-mini" style="width:100%;margin-top:10px;padding:11px">Remove from this app only</button>' : '') +
      '</section>';

    var list = $('detailFileList');
    if (list) list.innerHTML = files.slice(0, 200).map(function (f) {
      return '<div class="file-row"><div class="file-icon">' + h(fx(f.path).slice(0, 4).toUpperCase() || 'FILE') + '</div><div class="file-meta"><div class="file-name">' + h(nm(f.path)) + '</div><div class="file-path">' + h(f.path) + '</div></div><div class="file-size">' + fs(f.size) + '</div></div>';
    }).join('');
    if (typeof renderDraftBox === 'function') renderDraftBox(p);

    $('ppBack').onclick = function () { var ov = document.createElement('div'); ov.style.cssText = 'position:fixed;left:0;right:0;top:44px;bottom:60px;z-index:10001;background:#0d0e12;display:flex;align-items:center;justify-content:center'; ov.innerHTML = '<div style="width:30px;height:30px;border:3px solid #2a2c34;border-top-color:var(--red);border-radius:50%;animation:mb-spin .8s linear infinite"></div>'; document.body.appendChild(ov); setTimeout(function () { if (typeof showProjectsList === 'function') showProjectsList(); setTimeout(function () { ov.remove(); }, 350); }, 250); };
    $('ppPrev').onclick = function () { cardPreview(p.id); };
    $('ppEdit').onclick = function () { cardEdit(p.id); };
    $('ppBundle').onclick = function () { showTab('bundle'); if (typeof render === 'function') render(); };
    $('ppImport').onclick = function () { var i = $('changesFolderInput'); if (i) i.click(); };

    view.querySelectorAll('[data-pp]').forEach(function (b) {
      b.onclick = async function () {
        var a = b.getAttribute('data-pp');
        if (a === 'copylink') copy(link);
        else if (a === 'openlink') window.open(link, '_blank');
        else if (a === 'rename') {
          var v = await window.showPrompt('Rename project', p.name || '', { confirmText: 'Rename' });
          if (v == null) return; v = v.trim(); if (!v) return;
          var all = await dbGetAll();
          if (all.some(function (x) { return x.id !== p.id && x.name === v; })) { toast('A project with that name already exists', 'error'); return; }
          var cur = all.find(function (x) { return x.id === p.id; }); if (!cur) return;
          cur.name = v; await dbUpsertProject(cur);
          p.name = v; setCurrentProjectName(v); build(p); renderProjectCards();
          toast('Renamed', 'success');
        }
      };
    });

    var inp = $('ppConfirm'), del = $('ppDelete');
    inp.oninput = function () { del.disabled = !match(p, inp.value); };
    $('ppCopy').onclick = function () { copy(repo ? link : (p.name || '')); };
    del.onclick = function () { if (match(p, inp.value)) removeAll(p, del, inp); };
    var lo = $('ppLocal');
    if (lo) lo.onclick = async function () {
      var okk = await window.showConfirm('Remove "' + p.name + '" from this app only? The GitHub repository stays as it is.', { title: 'Remove from app', confirmText: 'Remove', cancelText: 'Keep' });
      if (!okk) return;
      await removeLocal(p.id);
      toast('Removed from this app', 'success');
      if (typeof showProjectsList === 'function') showProjectsList();
    };
  }

  async function open(id) {
    if ($('projectsListView')) $('projectsListView').hidden = true;
    view.hidden = false;
    var p = await loadProjectIntoMemory(id);
    if (!p) return;
    build(p);
    if (typeof populatePages === 'function') populatePages();
    if (typeof render === 'function') render();
    try { window.scrollTo(0, 0); } catch (e) {}
  }
  window.openProjectDetail = open;

  if (cards) cards.addEventListener('click', function (e) {
    var card = null;
    if (!card || e.target.closest('.pc-btn')) return;
    e.stopPropagation(); e.preventDefault();
    open(card.getAttribute('data-id'));
  }, true);
})();