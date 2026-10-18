/* sync.js — Google login + UI Gate */
(function () {
  if (typeof firebase === 'undefined') return;

  const auth = firebase.auth();
  const loginGate = document.getElementById("loginGate");
  const gateBtn = document.getElementById("gateLoginBtn");
  
  let cloudUser = null;
  
  window.getCloudUser = () => cloudUser;
  window.isCloudSignedIn = () => !!cloudUser;

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
  auth.getRedirectResult().catch(function(error) {
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
    cloudUser = user;
    renderAuthUi(user);
    updateGreeting(user);
    
    if (user) {
      // LOGGED IN
      if (loginGate) loginGate.style.display = "none"; 
      if (gateBtn) {
        gateBtn.innerHTML = 'Continue with Google';
        gateBtn.style.opacity = '1';
      }
      
      if (typeof window.__refreshProjects === "function") window.__refreshProjects();
      
    } else {
      // LOGGED OUT
      if (loginGate) loginGate.style.display = "flex"; 
      
      // Just clear the screen, but DO NOT wipe the database here
      if (typeof files !== 'undefined') {
        files = []; 
        if(typeof currentProjectId !== 'undefined') currentProjectId = null;
        if(typeof setCurrentProjectName === 'function') setCurrentProjectName('No project loaded');
      }
      if (typeof renderProjectCards === 'function') renderProjectCards();
      if (typeof render === 'function') render();
      
      const ghIn = document.getElementById('githubLoggedIn');
      const ghOut = document.getElementById('githubLoggedOut');
      if (ghIn && ghOut) { ghIn.hidden = true; ghOut.hidden = false; }
    }
  });

  // 4. Sign Out Function (WIPES DATA ONLY WHEN CLICKED)
  window.signOutGoogle = async function () {
    try {
      if (typeof window.clearToken === 'function') await window.clearToken();
      
      // Wipe local cache securely ONLY on manual sign out
      if (typeof window.__clearLocalData === 'function') {
        await window.__clearLocalData();
      }
      
      await auth.signOut();
    } catch (e) {}
  };

  // 5. Home Screen UI
  function renderAuthUi(user) {
    const box = document.getElementById("authBox");
    if (!box) return;
    if (user) {
      const displayName = user.displayName || "Signed in";
      const email = user.email || "No email provided";
      const photo = user.photoURL || "";
      
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