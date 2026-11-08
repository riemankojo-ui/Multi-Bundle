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
  window.mbBar = { start: start, done: done };
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.bottom span[data-tab], .bottom [data-tab], .drawer-nav a');
    if (!b) return;
    if (b.__mbGo) { b.__mbGo = false; return; }
    e.stopPropagation(); e.preventDefault();
    if (b.__mbWait) return;
    b.__mbWait = true; start();
    setTimeout(function () { b.__mbWait = false; b.__mbGo = true; b.click(); setTimeout(done, 200); }, 250);
  }, true);
})();