/* skeleton.js - the one place that controls the Projects skeleton.
   Gates (all must pass before the real cards replace it):
   1. The login check has finished (window.__authKnown).
   2. The real cards (or the empty message) are in the list.
   3. The list has stopped changing for SETTLE ms (no remove-and-land-again).
   4. The skeleton has been visible at least MIN_SHOW ms (no quick blink).
   After that it never comes back until the next refresh.
   First-time users (no saved project count) never see it. */
(function () {
  if (window.__mbSkel) return;
  var box = document.getElementById('projectCards');
  if (!box) return;

  var N = 0;
  try { N = parseInt(localStorage.getItem('mb_pcount') || '0', 10) || 0; } catch (e) {}

  // remove any older skeleton pieces left inside the list
  try { box.querySelectorAll('.mbsk, style').forEach(function (e) { e.remove(); }); } catch (e) {}

  if (N < 1) return;           // nothing was saved before: no skeleton
  N = Math.min(N, 20);

  var MIN_SHOW = 600;          // ms the skeleton stays at least
  var SETTLE = 400;            // ms the list must stay unchanged
  var MAX_WAIT = 15000;        // ms of visible waiting before giving up

  var css = [
    'html.mbsx-on #projectCards{display:none!important}',
    '#mbSkel{display:grid;grid-template-columns:1fr;gap:12px;transition:opacity .25s ease;pointer-events:none}',
    '@media(min-width:600px){#mbSkel{grid-template-columns:1fr 1fr}}',
    '#mbSkel.out{opacity:0}',
    '.mbsx{background:#0f1013;border:1px solid #26272e;border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:12px;overflow:hidden}',
    '.mbsx-row{display:flex;align-items:center;gap:10px}',
    '.mbsx-col{flex:1;min-width:0}',
    '.mbsx i{display:block;position:relative;overflow:hidden;background:#1b1c22;border-radius:8px}',
    '.mbsx i::after{content:"";position:absolute;inset:0;transform:translateX(-100%);background:linear-gradient(90deg,transparent,rgba(255,255,255,.08),transparent);animation:mbsx 1.4s ease-in-out infinite}',
    '.mbsx:nth-child(2) i::after{animation-delay:.12s}',
    '.mbsx:nth-child(3) i::after{animation-delay:.24s}',
    '.mbsx:nth-child(4) i::after{animation-delay:.36s}',
    '@keyframes mbsx{to{transform:translateX(100%)}}',
    '.mbsx-ic{width:38px;height:38px;border-radius:10px!important;flex-shrink:0}',
    '.mbsx-l1{height:12px;width:55%}',
    '.mbsx-l2{height:9px;width:35%;margin-top:8px}',
    '.mbsx-chip{height:18px;width:76px;border-radius:999px!important}',
    '.mbsx-b{flex:1;height:30px}',
    '.mbsx-b.s{flex:0 0 36px}',
    '#projectCards.mbsx-in{animation:mbsxin .28s ease}',
    '@keyframes mbsxin{from{opacity:0}to{opacity:1}}'
  ].join('\n');

  var st = document.createElement('style');
  st.id = 'mbSkelCss';
  st.textContent = css;
  document.head.appendChild(st);

  var card = '<div class="mbsx"><div class="mbsx-row"><i class="mbsx-ic"></i><div class="mbsx-col"><i class="mbsx-l1"></i><i class="mbsx-l2"></i></div></div><i class="mbsx-chip"></i><div class="mbsx-row"><i class="mbsx-b"></i><i class="mbsx-b"></i><i class="mbsx-b"></i><i class="mbsx-b s"></i></div></div>';
  var sk = document.createElement('div');
  sk.id = 'mbSkel';
  sk.innerHTML = new Array(N + 1).join(card);

  document.documentElement.classList.add('mbsx-on');
  box.parentNode.insertBefore(sk, box);

  var pill = document.getElementById('projectCount');
  if (pill) pill.textContent = N + ' / 20';

  var t0 = Date.now(), last = t0, visMs = 0, done = false;

  var mo = null;
  try {
    mo = new MutationObserver(function () { last = Date.now(); });
    mo.observe(box, { childList: true, subtree: true });
  } catch (e) {}

  function pageVisible() {
    var pg = document.getElementById('projectsPage');
    return !pg || !pg.hidden;
  }

  function finish() {
    if (done) return;
    done = true;
    clearInterval(timer);
    try { if (mo) mo.disconnect(); } catch (e) {}
    var host = sk.parentNode;
    try {
      // let the skeleton fade out on top of the cards while they fade in
      if (host && getComputedStyle(host).position === 'static') host.style.position = 'relative';
      var top = sk.offsetTop, left = sk.offsetLeft, w = sk.offsetWidth;
      sk.style.position = 'absolute';
      sk.style.top = top + 'px';
      sk.style.left = left + 'px';
      sk.style.width = w + 'px';
    } catch (e) {}
    document.documentElement.classList.remove('mbsx-on');
    box.classList.add('mbsx-in');
    sk.classList.add('out');
    setTimeout(function () {
      box.classList.remove('mbsx-in');
      if (sk.parentNode) sk.parentNode.removeChild(sk);
    }, 320);
  }

  var timer = setInterval(function () {
    if (done) return;
    var now = Date.now();
    var vis = pageVisible();
    if (vis) visMs += 120;
    var auth = (typeof window.__authKnown === 'undefined') || window.__authKnown === true;
    var real = !!box.querySelector('.project-card, .pc-empty');
    var ready = real && auth && vis && (now - last >= SETTLE) && (now - t0 >= MIN_SHOW);
    if (ready || visMs >= MAX_WAIT) finish();
  }, 120);

  window.__mbSkel = { finish: finish };
})();
