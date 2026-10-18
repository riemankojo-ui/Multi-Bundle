/* sync.js — Google login + UI Gate */
(function () {
  if (typeof firebase === 'undefined') {
    alert("Firebase failed to load. Check index.html.");
    return;
  }

  const auth = firebase.auth();
  const loginGate = document.getElementById("loginGate");
  const gateBtn = document.getElementById("gateLoginBtn");
  
  let cloudUser = null;
  
  window.getCloudUser = () => cloudUser;
  window.isCloudSignedIn = () => !!cloudUser;

  // 1. SMART LOGIN (Tries Popup, falls back to Redirect if blocked)
  if (gateBtn) {
    gateBtn.onclick = async function () {
      gateBtn.innerHTML = 'Connecting...';
      gateBtn.style.opacity = '0.7';
      document.body.style.backgroundColor = '#0d0e12';
      
      const provider = new firebase.auth.GoogleAuthProvider();
      // This forces the account picker to appear even if you just signed out
      provider.setCustomParameters({ prompt: "select_account" });
      
      try {
        // Try Popup first (Best for desktop & fixes mobile loops)
        await auth.signInWithPopup(provider);
      } catch (e) {
        // If popup is blocked by the phone, use redirect
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

  // 2. Catch redirect errors if it had to fall back
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
    
    if (user) {
      // LOGGED IN
      if (loginGate) loginGate.style.display = "none"; 
      
      // Reset the button for next time
      if (gateBtn) {
        gateBtn.innerHTML = 'Continue with Google';
        gateBtn.style.opacity = '1';
      }

      if (typeof window.__refreshProjects === "function") window.__refreshProjects();
      
    } else {
      // LOGGED OUT: Wipe the screen clean
      if (loginGate) loginGate.style.display = "flex"; 
      
      if (typeof files !== 'undefined') {
        files = []; 
        if(typeof currentProjectId !== 'undefined') currentProjectId = null;
        if(typeof setCurrentProjectName === 'function') setCurrentProjectName('No project loaded');
      }
      
      if (typeof renderProjectCards === 'function') renderProjectCards();
      if (typeof render === 'function') render();
      
      // Clear GitHub screen
      const ghIn = document.getElementById('githubLoggedIn');
      const ghOut = document.getElementById('githubLoggedOut');
      if (ghIn && ghOut) { ghIn.hidden = true; ghOut.hidden = false; }
    }
  });

  // 4. Sign Out Function
  window.signOutGoogle = async function () {
    try {
      if (typeof window.clearToken === 'function') {
        await window.clearToken();
      }
      await auth.signOut();
    } catch (e) {
      console.error("Sign out error", e);
    }
  };

  // 5. Update Home Screen Card
  function renderAuthUi(user) {
    const box = document.getElementById("authBox");
    if (!box) return;
    if (user) {
      box.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
          <img src="${user.photoURL || ""}" style="width:38px;height:38px;border-radius:50%;background:#2a2c34;">
          <div style="flex:1;min-width:0;">
            <b style="display:block;font-size:13px;color:#fff;">${user.displayName || "Signed in"}</b>
            <small style="display:block;font-size:11px;color:var(--muted);">${user.email || ""}</small>
          </div>
          <button class="btn secondary" onclick="window.signOutGoogle()" style="padding:8px 12px;font-size:11px;">Sign out</button>
        </div>
      `;
    } else {
      box.innerHTML = `<p class="note">Not signed in.</p>`;
    }
  }
})();