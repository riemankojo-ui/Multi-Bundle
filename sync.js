/* sync.js - sign in with Google, GitHub or email. Each account has its own private projects on this phone. */
(function () {
  if (typeof firebase === 'undefined') return;

  const auth = firebase.auth();
  const $ = (id) => document.getElementById(id);
  const loginGate = $("loginGate");

  let cloudUser = null;
  let authKnown = false;
  let rememberedUid = '';
  let busy = false;
  let signingOut = false;
  let mode = 'signin';
  try { rememberedUid = localStorage.getItem('mb_uid') || ''; } catch (e) {}

  // Until Google answers, act as the account that was signed in last time so a refresh keeps your projects.
  window.getCloudUser = () => cloudUser || (!authKnown && rememberedUid ? { uid: rememberedUid } : null);
  window.isCloudSignedIn = () => !!cloudUser;
  Object.defineProperty(window, '__authKnown', { get: () => authKnown, configurable: true });

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function toast(m, t) { if (typeof window.showToast === 'function') window.showToast(m, t); }

  // ---------- profile helpers (a "profile" is {displayName,email,photoURL,provider}) ----------
  function profileOf(u) {
    if (!u) return null;
    const pd = u.providerData && u.providerData[0];
    return { displayName: u.displayName || '', email: u.email || (pd && pd.email) || '', photoURL: u.photoURL || '', provider: (pd && pd.providerId) || '' };
  }
  function nameOf(p) { return p.displayName || (p.email ? p.email.split('@')[0] : 'Signed in'); }
  function providerLabel(p) { return p.provider === 'google.com' ? 'Google' : p.provider === 'github.com' ? 'GitHub' : p.provider === 'password' ? 'Email' : ''; }
  function avatarHtml(p, size) {
    const letter = esc(nameOf(p).charAt(0).toUpperCase());
    return '<span class="acc-av" style="width:' + size + 'px;height:' + size + 'px;font-size:' + Math.round(size * 0.42) + 'px"><span>' + letter + '</span>' +
      (p.photoURL ? '<img src="' + esc(p.photoURL) + '" alt="" referrerpolicy="no-referrer" onerror="this.remove()">' : '') + '</span>';
  }
  function saveProfile(u) {
    try {
      if (u) localStorage.setItem('mb_profile', JSON.stringify(profileOf(u)));
      else localStorage.removeItem('mb_profile');
    } catch (e) {}
  }
  function cachedProfile() {
    try { return JSON.parse(localStorage.getItem('mb_profile') || 'null'); } catch (e) { return null; }
  }

  // ---------- styles ----------
  function injectCss() {
    if ($('accStyle')) return;
    const st = document.createElement('style'); st.id = 'accStyle';
    st.textContent = [
      '.acc-row{display:flex;align-items:center;gap:10px}',
      '.acc-av{position:relative;display:inline-grid;place-items:center;border-radius:50%;background:#2f3a52;color:#cfe0ff;font-weight:800;flex-shrink:0;overflow:hidden}',
      '.acc-av img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}',
      '.acc-txt{flex:1;min-width:0}',
      '.acc-txt b{display:block;font-size:14px;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.acc-txt small{display:block;font-size:11px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.acc-badge{display:inline-block;margin-top:3px;font-style:normal;font-size:9px;font-weight:800;letter-spacing:.8px;text-transform:uppercase;background:#2f3a52;color:#cfe0ff;border-radius:999px;padding:2px 7px}',
      '.acc-out{flex:none!important;padding:8px 12px!important;font-size:11px!important}',
      '.drawer-section .drawer-acc{display:flex;align-items:center;gap:10px;background:#1c1d22;border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin-bottom:4px}',
      '.drawer-section .drawer-acc-out{flex:none;padding:7px 10px;font-size:11px;border-radius:8px;background:#2a1418;border:1px solid #5a2430;color:#ff8a8a;transition:transform .14s ease}',
      '.drawer-section .drawer-acc-out:active{transform:scale(.95)}',
      '#loginGate .g-btn{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;padding:14px 18px;border-radius:12px;font-size:15px;font-weight:800;border:0;cursor:pointer;font-family:inherit;transition:transform .14s ease,opacity .14s ease}',
      '#loginGate .g-btn:active{transform:scale(.97)}',
      '#loginGate .g-google{background:var(--red);color:#fff}',
      '#loginGate .g-github{background:#24292f;color:#fff;border:1px solid #3a3f45;margin-top:10px}',
      '#loginGate .g-main{background:#fff;color:#0d0e12}',
      '#loginGate .g-or{display:flex;align-items:center;gap:10px;color:#6f707a;font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;margin:18px 0 14px}',
      '#loginGate .g-or::before,#loginGate .g-or::after{content:"";flex:1;height:1px;background:#2a2b31}',
      '#loginGate .g-input{width:100%;box-sizing:border-box;background:#15161a;color:#fff;border:1px solid #303139;border-radius:12px;padding:14px;font-size:15px;outline:0;font-family:inherit;margin-bottom:10px}',
      '#loginGate .g-input:focus{border-color:var(--red)}',
      '#loginGate .g-links{display:flex;justify-content:space-between;gap:10px;margin-top:10px}',
      '#loginGate .g-link{background:none;border:0;color:#a2a3ad;font-size:12px;font-weight:700;cursor:pointer;padding:6px 2px;font-family:inherit}',
      '#loginGate .g-msg{min-height:18px;font-size:12.5px;line-height:1.5;margin-top:12px}'
    ].join('\n');
    document.head.appendChild(st);
  }

  // ---------- account UI (home card + menu) ----------
  function renderAuthUi(p) {
    const box = $("authBox");
    if (!box) return;
    if (!p) { box.innerHTML = '<p class="note">Not signed in.</p>'; return; }
    const prov = providerLabel(p);
    box.innerHTML = '<div class="acc-row">' + avatarHtml(p, 40) +
      '<div class="acc-txt"><b>' + esc(nameOf(p)) + '</b><small>' + esc(p.email) + '</small>' + (prov ? '<em class="acc-badge">' + prov + '</em>' : '') + '</div>' +
      '<button class="btn secondary acc-out" onclick="window.signOutGoogle()">Sign out</button></div>';
  }
  function renderDrawerAccount(p) {
    const box = $("drawerAccount");
    if (!box) return;
    if (!p) { box.innerHTML = ''; return; }
    box.innerHTML = '<div class="drawer-acc">' + avatarHtml(p, 34) +
      '<div class="acc-txt"><b>' + esc(nameOf(p)) + '</b><small>' + esc(p.email) + '</small></div>' +
      '<button class="drawer-acc-out" onclick="window.signOutGoogle()">Sign out</button></div>';
  }
  function updateGreeting(p) {
    const heroEyebrow = $('heroEyebrow');
    if (!heroEyebrow) return;
    if (p) heroEyebrow.textContent = 'WELCOME BACK, ' + nameOf(p).split(' ')[0].toUpperCase();
    else heroEyebrow.textContent = 'YOUR LOCAL WORKSPACE';
  }
  function showProfile(p) { renderAuthUi(p); renderDrawerAccount(p); updateGreeting(p); }

  function resetScreen() {
    if (typeof files !== 'undefined') files = [];
    if (typeof currentProjectId !== 'undefined') currentProjectId = null;
    if (typeof setCurrentProjectName === 'function') setCurrentProjectName('No project loaded');
    try { if (typeof showTab === 'function') showTab('home'); } catch (e) {}
  }

  // ---------- GitHub token for an account (so "Continue with GitHub" also unlocks your repos) ----------
  async function saveGithubTokenFor(uid, token) {
    try {
      const db = await openDB();
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).put(token, 'githubToken_' + uid);
      await new Promise(function (r) { tx.oncomplete = r; tx.onerror = r; tx.onabort = r; });
    } catch (e) {}
  }
  async function afterGithub(res) {
  const tok = res && res.credential && res.credential.accessToken;
  if (tok && res.user) {
    await saveGithubTokenFor(res.user.uid, tok);
    
    // NEW: Save this token globally so the Projects tab can use it!
    if (typeof ghToken !== 'undefined') {
      ghToken = tok; 
    }
    try { localStorage.setItem('mb_gh_active_token', tok); } catch(e) {}

    if (typeof window.__reloadGithub === 'function') await window.__reloadGithub();
  }
}

  // ---------- sign-in screen ----------
  function setMsg(t, ok) { const m = $('gateMsg'); if (!m) return; m.textContent = t || ''; m.style.color = ok ? '#3ddc84' : '#ff8a8a'; }
  function setBusy(b) {
    busy = b;
    ['gateLoginBtn', 'gateGithubBtn', 'gateEmailBtn'].forEach(function (id) { const el = $(id); if (el) { el.disabled = b; el.style.opacity = b ? '.6' : '1'; } });
  }
  function friendly(e) {
    switch (e && e.code) {
      case 'auth/invalid-credential': case 'auth/wrong-password': case 'auth/user-not-found': return 'Wrong email or password.';
      case 'auth/invalid-email': return 'That email address does not look right.';
      case 'auth/email-already-in-use': return 'This email already has an account. Tap "Have an account? Sign in".';
      case 'auth/weak-password': return 'Use a password with at least 6 characters.';
      case 'auth/too-many-requests': return 'Too many tries. Wait a few minutes and try again.';
      case 'auth/network-request-failed': return 'No internet connection. Check it and try again.';
      case 'auth/operation-not-allowed': return 'This sign-in method is not turned on in Firebase yet.';
      case 'auth/account-exists-with-different-credential': return 'This email already has an account with another sign-in method. Sign in with that one first.';
      case 'auth/unauthorized-domain': return 'This website address is not allowed in Firebase yet (Authentication > Settings > Authorized domains).';
      case 'auth/user-disabled': return 'This account has been turned off.';
      default: return (e && e.message) || 'Something went wrong. Try again.';
    }
  }
  function quiet(e) { return e && (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request'); }

  async function googleLogin() {
    if (busy) return;
    setBusy(true); setMsg('');
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    try {
      await auth.signInWithPopup(provider);
    } catch (e) {
      if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') {
        try { await auth.signInWithRedirect(provider); return; } catch (e2) { setMsg(friendly(e2)); }
      } else if (!quiet(e)) { setMsg(friendly(e)); }
    }
    setBusy(false);
  }

  async function githubLogin() {
    if (busy) return;
    setBusy(true); setMsg('');
    const provider = new firebase.auth.GithubAuthProvider();
    provider.addScope('repo');
    try {
        const res = await auth.signInWithPopup(provider);
  await afterGithub(res);
} catch (e) {
  if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') {
    try { await auth.signInWithRedirect(provider); return; } catch (e2) { setMsg(friendly(e2)); }
  } else if (e.code === 'auth/account-exists-with-different-credential') {
    setMsg('You already have a Google account with this email. Please log in with Google, then go to the GitHub tab to link your repos.', false);
  } else if (!quiet(e)) { 
    setMsg(friendly(e)); 
  }
}
    setBusy(false);
  }

  async function emailSubmit() {
    if (busy) return;
    const email = (($('gateEmail') && $('gateEmail').value) || '').trim();
    const pw = ($('gatePassword') && $('gatePassword').value) || '';
    if (!email || !pw) { setMsg('Enter your email and password.'); return; }
    setBusy(true); setMsg('');
    try {
    if (mode === 'signup') {
      const name = (($('gateName') && $('gateName').value) || '').trim();
      const cred = await auth.createUserWithEmailAndPassword(email, pw);
      if (name) {
        await cred.user.updateProfile({ displayName: name });
        const u = auth.currentUser || cred.user;
        saveProfile(u); showProfile(profileOf(u));
      }
    } else {
      await auth.signInWithEmailAndPassword(email, pw);
    }
  } catch (e) { 
    setMsg(friendly(e)); 
    // Clear the inputs on error
    if ($('gateEmail')) $('gateEmail').value = '';
    if ($('gatePassword')) $('gatePassword').value = '';
    if ($('gateName')) $('gateName').value = '';
  }
  setBusy(false);
}

  async function forgotPassword() {
    const email = (($('gateEmail') && $('gateEmail').value) || '').trim();
    if (!email) { setMsg('Type your email above first, then tap Forgot password.'); return; }
    try {
      await auth.sendPasswordResetEmail(email);
      setMsg('Reset link sent to ' + email + '. Check your inbox and spam.', true);
    } catch (e) { setMsg(friendly(e)); }
  }

  function applyMode() {
    const up = mode === 'signup';
    if ($('gateNameWrap')) $('gateNameWrap').hidden = !up;
    if ($('gateEmailBtn')) $('gateEmailBtn').textContent = up ? 'Create account' : 'Sign in with email';
    if ($('gateModeBtn')) $('gateModeBtn').textContent = up ? 'Have an account? Sign in' : 'New here? Create account';
    if ($('gateForgot')) $('gateForgot').hidden = up;
    if ($('gatePassword')) $('gatePassword').autocomplete = up ? 'new-password' : 'current-password';
    setMsg('');
  }

  function wireGate() {
  // Password Toggle
  var toggleBtn = $('togglePasswordBtn');
  if (toggleBtn) {
    toggleBtn.onclick = function() {
      var pw = $('gatePassword'), eyeO = $('eyeOpen'), eyeC = $('eyeClosed');
      if (pw.type === 'password') {
        pw.type = 'text'; eyeO.style.display = 'none'; eyeC.style.display = 'block';
      } else {
        pw.type = 'password'; eyeO.style.display = 'block'; eyeC.style.display = 'none';
      }
    };
  }
  
  if ($('gateLoginBtn')) $('gateLoginBtn').onclick = googleLogin;
    if ($('gateGithubBtn')) $('gateGithubBtn').onclick = githubLogin;
    if ($('gateEmailBtn')) $('gateEmailBtn').onclick = emailSubmit;
    if ($('gateForgot')) $('gateForgot').onclick = forgotPassword;
    if ($('gateModeBtn')) $('gateModeBtn').onclick = function () { mode = mode === 'signin' ? 'signup' : 'signin'; applyMode(); };
    const pw = $('gatePassword');
    if (pw && pw.addEventListener) pw.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); emailSubmit(); } });
    applyMode();
  }

  // Redirect sign-in comes back here (popup blocked). Catch errors and the GitHub token.
  auth.getRedirectResult().then(async function (res) {
    if (res && res.credential && res.credential.providerId === 'github.com') await afterGithub(res);
  }).catch(function (error) {
    if (error.code !== 'auth/redirect-cancelled-by-user') setMsg(friendly(error));
    setBusy(false);
  });

  // ---------- login state watcher ----------
  auth.onAuthStateChanged(async (user) => {
  const previousUid = rememberedUid;
  authKnown = true;
  cloudUser = user;
  
  // Hide the loading spinner and show the form
const gateLoading = document.getElementById('gateLoading');
const gateContent = document.getElementById('gateContent');
if (gateLoading) gateLoading.style.display = 'none';
if (gateContent) gateContent.style.display = 'block';

// NEW: Unhide the app now that we know the login state
document.body.classList.remove('auth-loading'); document.documentElement.classList.add('auth-ready');

  const prof = profileOf(user);
  saveProfile(user);
  showProfile(prof);

    if (user) {
      try { localStorage.setItem('mb_uid', user.uid); } catch (e) {}
      rememberedUid = user.uid;
      if (loginGate) loginGate.style.display = "none";
      setBusy(false);
      // A different account than the one on screen: clear the old project from memory first
      if (previousUid && previousUid !== user.uid) resetScreen();
    } else {
      try { localStorage.removeItem('mb_uid'); } catch (e) {}
      rememberedUid = '';
      if (loginGate) loginGate.style.display = "flex";
      setBusy(false);
      resetScreen();
    }
    if (typeof window.__refreshProjects === "function") await window.__refreshProjects();
  });

  // ---------- sign out, in steps ----------
  function editorHasUnsaved() {
    const es = $('editorStatus');
    return !!(es && /\u2022\s*$/.test(es.textContent || ''));
  }
  window.signOutGoogle = async function () {
  if (signingOut) return;
  if (typeof closeDrawer === 'function') { try { closeDrawer(); } catch (e) {} }
  
  // NEW: Wipe the GitHub connection completely
  try { localStorage.removeItem('mb_gh_active_token'); } catch(e) {}
  if (typeof ghToken !== 'undefined') ghToken = '';
  if (typeof $('githubLoggedIn') !== 'undefined' && $('githubLoggedIn')) $('githubLoggedIn').hidden = true;
  if (typeof $('githubLoggedOut') !== 'undefined' && $('githubLoggedOut')) $('githubLoggedOut').hidden = false;
    const who = (cloudUser && (cloudUser.email || cloudUser.displayName)) || 'this account';
    const ask = typeof window.showConfirm === 'function' ? window.showConfirm : null;
    if (ask) {
      // Step 1: are you sure
      const ok1 = await ask('You are signed in as ' + who + '. Your projects stay saved on this phone for this account and come back when you sign in again.', { title: 'Sign out?', confirmText: 'Continue', cancelText: 'Stay signed in' });
      if (!ok1) return;
      // Step 2: unsaved edits warning
      if (editorHasUnsaved()) {
        const ok2 = await ask('You have unsaved edits in the editor. If you sign out now they will be lost. Go back and tap the save button first.', { title: 'Unsaved edits', confirmText: 'Sign out anyway', cancelText: 'Go back' });
        if (!ok2) return;
      }
    }
    // Step 3: save, then sign out
    signingOut = true; const so = document.createElement('div'); so.style.cssText = 'position:fixed;inset:0;background:#0d0e12;z-index:10000;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#a2a3ad;font-size:16px;font-weight:bold;font-family:system-ui,sans-serif'; so.innerHTML = '<div class="spinner" style="margin:0 auto 16px"></div>Signing out...'; document.body.appendChild(so); setTimeout(function () { try { so.remove(); } catch (e0) {} }, 1600);
    try {
      toast('Saving your projects\u2026');
if (typeof __flushProjects === 'function') await __flushProjects();

// Show the loading screen immediately
if (loginGate) loginGate.style.display = "flex";
if ($('gateLoading')) $('gateLoading').style.display = 'block';
if ($('gateContent')) $('gateContent').style.display = 'none';

await auth.signOut();
      toast('Signed out');
    } catch (e) {
      toast('Could not sign out. Try again.', 'error');
    }
    signingOut = false;
  };

  // ---------- start ----------
  injectCss();
  wireGate();
  // Show the last signed-in profile at once, so the account card does not blink on refresh
  const cp = cachedProfile();
  if (rememberedUid && cp) showProfile(cp);
})();
