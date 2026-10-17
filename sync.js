/* sync.js — Google login + Firestore */
(function () {
  // Check if Firebase loaded
  if (typeof firebase === 'undefined') {
    alert("Error: Firebase library failed to load. Check your internet connection.");
    return;
  }

  const auth = firebase.auth();
  const db = firebase.firestore();
  const loginGate = document.getElementById("loginGate");
  const gateBtn = document.getElementById("gateLoginBtn");
  
  let cloudUser = null;

  // Google Login Button Click
  if (gateBtn) {
    gateBtn.onclick = async function () {
      gateBtn.innerHTML = 'Connecting...';
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      
      try {
        // Use Popup (works best on desktop/incognito)
        await auth.signInWithPopup(provider);
      } catch (e) {
        // Show exact error if it fails
        alert("Login Error!\n\nCode: " + e.code + "\nMessage: " + e.message);
        gateBtn.innerHTML = 'Continue with Google';
      }
    };
  }

  // Watch for Login/Logout
  auth.onAuthStateChanged(async (user) => {
    cloudUser = user;
    
    if (user) {
      if (loginGate) loginGate.style.display = "none"; 
      if (typeof window.__refreshProjects === "function") window.__refreshProjects();
    } else {
      if (loginGate) loginGate.style.display = "flex"; 
    }
  });

  // Database Sync
  const originalGetAll = window.dbGetAll;
  const originalSetAll = window.dbSetAll;

  window.dbGetAll = async function () {
    if (!cloudUser) return originalGetAll();
    const snap = await db.collection("users").doc(cloudUser.uid).collection("data").doc("projects").get();
    return snap.exists ? snap.data().projects || [] : [];
  };

  window.dbSetAll = async function (projects) {
    if (!cloudUser) return originalSetAll(projects);
    await db.collection("users").doc(cloudUser.uid).collection("data").doc("projects").set({ projects, updatedAt: Date.now() });
    try { await originalSetAll(projects); } catch (e) {}
  };

  // Update Home Screen Card
  window.signOutGoogle = async function () { await auth.signOut(); };
  auth.onAuthStateChanged((user) => {
    const box = document.getElementById("authBox");
    if (!box) return;
    if (user) {
      box.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;">
          <img src="${user.photoURL || ""}" style="width:38px;height:38px;border-radius:50%;">
          <div style="flex:1;">
            <b>${user.displayName || "Signed in"}</b>
            <small style="display:block;color:gray;">${user.email}</small>
          </div>
          <button class="btn secondary" onclick="window.signOutGoogle()">Sign out</button>
        </div>`;
    }
  });
})();