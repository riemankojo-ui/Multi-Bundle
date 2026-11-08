(function () {
  if (window.mbBar) return;
  var st = document.createElement('style');
  st.textContent = '#mbBar{position:fixed;left:0;top:0;height:2px;width:0;z-index:10050;background:#CD853F;box-shadow:0 0 6px #CD853F;pointer-events:none;opacity:0;transition:width .3s ease,opacity .25s ease}';
  document.head.appendChild(st);
  var el = document.createElement('div'); el.id = 'mbBar';
  document.documentElement.appendChild(el);
  var t1, t2, busy = 0;
  function start() {
    busy++; clearTimeout(t1); clearTimeout(t2);
    el.style.transition = 'none'; el.style.width = '0'; el.style.opacity = '1';
    void el.offsetWidth;
    el.style.transition = 'width 8s cubic-bezier(.1,.8,.2,1),opacity .25s ease';
    el.style.width = '85%';
  }
  function done() {
    busy = Math.max(0, busy - 1); if (busy) return;
    el.style.transition = 'width .2s ease,opacity .3s ease .15s';
    el.style.width = '100%';
    t1 = setTimeout(function () { el.style.opacity = '0'; }, 200);
    t2 = setTimeout(function () { el.style.width = '0'; }, 600);
  }
  function run(ms, cb) {
    busy = 0; clearTimeout(t1); clearTimeout(t2);
    el.style.transition = 'none'; el.style.width = '0'; el.style.opacity = '1';
    void el.offsetWidth;
    el.style.transition = 'width ' + ms + 'ms cubic-bezier(.25,.6,.35,1)';
    el.style.width = '100%';
    setTimeout(function () {
      cb();
      t1 = setTimeout(function () { el.style.transition = 'opacity .3s ease'; el.style.opacity = '0'; }, 120);
      t2 = setTimeout(function () { el.style.transition = 'none'; el.style.width = '0'; }, 520);
    }, ms);
  }
  function finish(cb) {
    if (!busy) { run(300, cb); return; }
    busy = 0; clearTimeout(t1); clearTimeout(t2);
    el.style.transition = 'width .25s ease';
    el.style.width = '100%';
    setTimeout(function () {
      cb();
      t1 = setTimeout(function () { el.style.transition = 'opacity .3s ease'; el.style.opacity = '0'; }, 120);
      t2 = setTimeout(function () { el.style.transition = 'none'; el.style.width = '0'; }, 520);
    }, 270);
  }
  window.mbBar = { start: start, done: done, run: run, finish: finish };
  window.mbBar.set = function (p) {
    p = Math.max(0, Math.min(99, p));
    el.style.opacity = '1';
    el.style.transition = 'width .25s ease,opacity .25s ease';
    el.style.width = p + '%';
  };
  window.mbBar.refresh = async function () {
    try { if (typeof window.__refreshProjects === 'function') await window.__refreshProjects(); } catch (e) {}
    try { if (typeof renderProjectCards === 'function') await renderProjectCards(); } catch (e) {}
    try { if (typeof render === 'function') render(); } catch (e) {}
  };
  function soft(cb) {
    if (String(cb).indexOf('location.reload') < 0) { cb(); return; }
    try { if (typeof renderProjectCards === 'function') renderProjectCards(); } catch (e) {}
    try { if (typeof render === 'function') render(); } catch (e) {}
  }
  var _run = run, _fin = finish;
  window.mbBar.run = function (ms, cb) { _run(ms, function () { soft(cb); }); };
  window.mbBar.finish = function (cb) { _fin(function () { soft(cb); }); };
  var _imp = window.importRepo;
  if (typeof _imp === 'function') {
    window.importRepo = async function () {
      window.mbBar.start();
      try { return await _imp.apply(this, arguments); }
      finally { window.mbBar.done(); }
    };
  }
  try {
    if (window.firebase && firebase.auth) {
      var first = true, lastUid;
      firebase.auth().onAuthStateChanged(async function (u) {
        var uid = u ? u.uid : '';
        if (first) { first = false; lastUid = uid; return; }
        if (uid === lastUid) return;
        lastUid = uid;
        window.mbBar.start();
        await new Promise(function (r) { setTimeout(r, 700); });
        try { await window.mbBar.refresh(); } catch (e) {}
        window.mbBar.done();
      });
    }
  } catch (e) {}
  document.addEventListener('focusin', function (e) {
    var t = e.target;
    if (!t || !/^(TEXTAREA|INPUT)$/.test(t.tagName)) return;
    var o = document.getElementById('lcRoot') || document.querySelector('#mbFileSheetBd.open');
    if (o && !o.contains(t)) t.blur();
  }, true);
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.bottom span[data-tab], .bottom [data-tab], .drawer-nav a, .drawer-section > button, #homeProjectsBtn, #homePreviewBtn, #homeOpenPreviewBtn, #backupsBundleBtn, #backHomeBtn, #detailEditBtn, #detailBundleBtn, .pc-btn[data-act="preview"], .pc-btn[data-act="edit"]');
    if (!b) return;
    if (b.__mbGo) { b.__mbGo = false; return; }
    e.stopPropagation(); e.preventDefault();
    if (b.__mbWait) return;
    b.__mbWait = true;
    run(400, function () { b.__mbWait = false; b.__mbGo = true; b.click(); });
  }, true);
})();