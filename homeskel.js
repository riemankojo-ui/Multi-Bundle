/* homeskel.js - skeleton for the parts of Home that depend on the last project
   (project name, file count, status text and the two buttons).
   Shows from the first paint if a project was open last time, stays until the
   project is really loaded, then fades in the real values. Never returns until
   the next refresh. */
(function () {
  if (window.__mbHomeSkel) return;
  var lastId = null;
  try { lastId = localStorage.getItem('mb_active_project'); } catch (e) {}
  if (!lastId) return;                       // nothing was open before: no skeleton

  var root = document.documentElement;
  var MIN_SHOW = 600, MAX_WAIT = 12000, NOPROJ_WAIT = 3000;
  var t0 = Date.now(), authAt = 0, done = false;

  var css = [
    'html.mbhs-on #homeProjectName,html.mbhs-on #homeFileCount,html.mbhs-on #homeStatus,html.mbhs-on #homeBundleBtn,html.mbhs-on #homeOpenPreviewBtn{',
    'color:transparent!important;-webkit-text-fill-color:transparent!important;',
    'background:linear-gradient(90deg,#1b1c22 25%,#2a2c35 50%,#1b1c22 75%)!important;background-size:200% 100%;',
    'animation:mbhs 1.4s ease-in-out infinite;border-color:transparent!important;border-radius:8px;pointer-events:none;box-shadow:none!important}',
    'html.mbhs-on #homeProjectName{width:55%;min-height:1.2em}',
    'html.mbhs-on #homeStatus{width:80%;min-height:1.2em}',
    'html.mbhs-on #homeFileCount{border-color:transparent!important}',
    'html.mbhs-on #homeLive{display:none!important}',
    '@keyframes mbhs{0%{background-position:200% 0}100%{background-position:-200% 0}}',
    'html.mbhs-fade #homeProjectName,html.mbhs-fade #homeFileCount,html.mbhs-fade #homeStatus,html.mbhs-fade #homeBundleBtn,html.mbhs-fade #homeOpenPreviewBtn{animation:mbhsin .3s ease}',
    '@keyframes mbhsin{from{opacity:.25}to{opacity:1}}'
  ].join('');

  var st = document.createElement('style');
  st.id = 'mbHomeSkelCss';
  st.textContent = css;
  (document.head || root).appendChild(st);
  root.classList.add('mbhs-on');

  function finish() {
    if (done) return;
    done = true;
    clearInterval(timer);
    root.classList.remove('mbhs-on');
    root.classList.add('mbhs-fade');
    setTimeout(function () { root.classList.remove('mbhs-fade'); }, 400);
  }

  var timer = setInterval(function () {
    if (done) return;
    var now = Date.now();
    var auth = (typeof window.__authKnown === 'undefined') || window.__authKnown === true;
    if (auth && !authAt) authAt = now;

    var applied = false;
    try {
      var nm = document.getElementById('homeProjectName');
      applied = (typeof currentProjectId !== 'undefined') && currentProjectId === lastId &&
                nm && nm.textContent && nm.textContent !== 'No project loaded';
    } catch (e) {}

    // project really loaded -> show it
    if (applied && now - t0 >= MIN_SHOW) return finish();
    // login known for a while and the project is still missing (it was deleted) -> stop waiting
    if (authAt && now - authAt >= NOPROJ_WAIT && now - t0 >= MIN_SHOW) {
      var still = false;
      try { still = !!localStorage.getItem('mb_active_project'); } catch (e) {}
      if (!still) return finish();
    }
    if (now - t0 >= MAX_WAIT) finish();
  }, 120);

  window.__mbHomeSkel = { finish: finish };
})();
