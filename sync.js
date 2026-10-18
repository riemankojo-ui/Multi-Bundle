/* sync.js - Google login + per-account projects (kept on this phone, one private space per account) */
(function () {
  if (typeof firebase === 'undefined') return;

  const auth = firebase.auth();
  const loginGate = document.getElementById("loginGate");
  const gateBtn = document.getElementById("gateLoginBtn");

  let cloudUser = null;
  let authKnown = false;
  let rememberedUid = '';
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

  function resetScreen() {
    if (typeof files !== 'undefined') files = [];
    if (typeof currentProjectId !== 'undefined') currentProjectId = null;
    if (typeof setCurrentProjectName === 'function') setCurrentProjectName('No project loaded');
    try { if (typeof showTab === 'function') showTab('home'); } catch (e) {}
  }

  // 1. SMART LOGIN
  if (gateBtn) {
    gateBtn.onclick = async function () {
      gateBtn.innerHTML = 'Connecting...';
      gateBtn.style.opacity = '0.7';
      document.body.style.backgroundColor = '#0d0e12';

      const provider = new firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });

      try {
        await auth.signInWithPopup(provider);
      } catch (e) {
        if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') {
          await auth.signInWithRedirect(provider);
        } else {
          alert("Login Error:\n" + e.message);
          gateBtn.innerHTML = 'Continue with Google';
          gateBtn.style.opacity = '1';
        }
      }
    };
  }

  // 2. Catch redirect errors
  auth.getRedirectResult().catch(function (error) {
    if (error.code !== 'auth/redirect-cancelled-by-user') {
      alert("Login Error:\n" + error.message);
    }
    if (gateBtn) {
      gateBtn.innerHTML = 'Continue with Google';
      gateBtn.style.opacity = '1';
    }
  });

  // 3. Login State Watcher
  auth.onAuthStateChanged(async (user) => {
    const previousUid = rememberedUid;
    authKnown = true;
    cloudUser = user;
    renderAuthUi(user);
    updateGreeting(user);

    if (user) {
      try { localStorage.setItem('mb_uid', user.uid); } catch (e) {}
      rememberedUid = user.uid;
      if (loginGate) loginGate.style.display = "none";
      if (gateBtn) {
        gateBtn.innerHTML = 'Continue with Google';
        gateBtn.style.opacity = '1';
      }
      // A different account than the one on screen: clear the old project from memory first
      if (previousUid && previousUid !== user.uid) resetScreen();
    } else {
      try { localStorage.removeItem('mb_uid'); } catch (e) {}
      rememberedUid = '';
      if (loginGate) loginGate.style.display = "flex";
      resetScreen();
    }
    if (typeof window.__refreshProjects === "function") await window.__refreshProjects();
  });

  // 4. Sign out: saves pending edits, keeps this account's projects on the phone
  window.signOutGoogle = async function () {
    try {
      if (typeof __flushProjects === 'function') await __flushProjects();
      if (typeof window.clearToken === 'function') await window.clearToken();
      await auth.signOut();
    } catch (e) {}
  };

  // 5. Home Screen UI
  function renderAuthUi(user) {
    const box = document.getElementById("authBox");
    if (!box) return;
    if (user) {
      const displayName = esc(user.displayName || "Signed in");
      const email = esc(user.email || "No email provided");
      const photo = esc(user.photoURL || "");

      box.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
          ${photo ? `<img src="${photo}" style="width:38px;height:38px;border-radius:50%;background:#2a2c34;">` : ''}
          <div style="flex:1;min-width:0;">
            <b style="display:block;font-size:14px;color:#fff;">${displayName}</b>
            <small style="display:block;font-size:11px;color:var(--muted);">${email}</small>
          </div>
          <button class="btn secondary" onclick="window.signOutGoogle()" style="padding:8px 12px;font-size:11px;">Sign out</button>
        </div>
      `;
    } else {
      box.innerHTML = `<p class="note">Not signed in.</p>`;
    }
  }

  // 6. Personalize Greeting
  function updateGreeting(user) {
    const heroEyebrow = document.getElementById('heroEyebrow');
    if (!heroEyebrow) return;

    if (user && user.displayName) {
      const firstName = user.displayName.split(' ')[0];
      heroEyebrow.textContent = `WELCOME BACK, ${firstName.toUpperCase()}`;
    } else {
      heroEyebrow.textContent = 'YOUR LOCAL WORKSPACE';
    }
  }
})();
