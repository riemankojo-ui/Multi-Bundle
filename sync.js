/* sync.js — Google login + UI Gate */
(function () {
  if (typeof firebase === 'undefined') return;

  const auth = firebase.auth();
  const loginGate = document.getElementById("loginGate");
  const gateBtn = document.getElementById("gateLoginBtn");
  
  let cloudUser = null;
  
  window.getCloudUser = () => cloudUser;
  window.isCloudSignedIn = () => !!cloudUser;

  // 1. Login Button
  if (gateBtn) {
    gateBtn.onclick = async function () {
      gateBtn.innerHTML = 'Connecting to Google...';
      gateBtn.style.opacity = '0.7';
      document.body.style.backgroundColor = '#0d0e12';
      
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      
      try {
        await auth.signInWithRedirect(provider);
      } catch (e) {
        alert("Login Error:\n" + e.message);
        gateBtn.innerHTML = 'Continue with Google';
        gateBtn.style.opacity = '1';
      }
    };
  }

  // 2. Login State
  auth.onAuthStateChanged(async (user) => {
    cloudUser = user;
    renderAuthUi(user);
    
    if (user) {
      if (loginGate) loginGate.style.display = "none"; 
      if (typeof window.__refreshProjects === "function") window.__refreshProjects();
    } else {
      // WIPE EVERYTHING ON LOGOUT
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

  window.signOutGoogle = async function () {
    if (typeof window.clearToken === 'function') await window.clearToken();
    await auth.signOut();
  };

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