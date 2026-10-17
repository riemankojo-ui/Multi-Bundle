/* sync.js — Google login + Firestore-backed project storage */
(function () {
  if (typeof firebase === 'undefined') {
    console.error("Firebase failed to load.");
    return;
  }

  const auth = firebase.auth();
  const db = firebase.firestore();
  const loginGate = document.getElementById("loginGate");
  const gateBtn = document.getElementById("gateLoginBtn");
  
  let cloudUser = null;

  // Add click event to the big Google button on the gate
  if (gateBtn) {
    gateBtn.onclick = async function () {
      gateBtn.innerHTML = 'Signing in...';
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      try {
        await auth.signInWithRedirect(provider);
      } catch (e) {
        if (window.showToast) window.showToast(e.message, "error");
        gateBtn.innerHTML = 'Continue with Google';
      }
    };
  }

  // Check if we just came back from a redirect login
auth.getRedirectResult().catch(function(error) {
  if (window.showToast) window.showToast(error.message, "error");
  if (gateBtn) gateBtn.innerHTML = 'Continue with Google';
});

// Listen for login/logout
auth.onAuthStateChanged(async (user) => {
    cloudUser = user;
    renderAuthUi(user);

    if (user) {
      if (loginGate) loginGate.style.display = "none"; // Hide the gate
      await migrateLocalToCloud(user.uid);
      if (typeof window.__refreshProjects === "function") window.__refreshProjects();
    } else {
      if (loginGate) loginGate.style.display = "flex"; // Show the gate
    }
  });

  window.signOutGoogle = async function () {
    await auth.signOut();
  };

  function projectsDoc(uid) {
    return db.collection("users").doc(uid).collection("data").doc("projects");
  }

  async function cloudGetProjects(uid) {
    const snap = await projectsDoc(uid).get();
    return snap.exists ? snap.data().projects || [] : null;
  }

  async function cloudSetProjects(uid, projects) {
    await projectsDoc(uid).set({ projects, updatedAt: Date.now() });
  }

  async function migrateLocalToCloud(uid) {
    const existing = await cloudGetProjects(uid);
    if (existing && existing.length) return; 

    if (typeof window.__idbGetAll === 'function') {
      const local = await window.__idbGetAll();
      if (local && local.length) {
        await cloudSetProjects(uid, local);
      }
    }
  }

  const originalGetAll = window.dbGetAll;
  const originalSetAll = window.dbSetAll;
  window.__idbGetAll = originalGetAll;

  window.dbGetAll = async function () {
    if (!cloudUser) return originalGetAll();
    const projects = await cloudGetProjects(cloudUser.uid);
    return projects || [];
  };

  window.dbSetAll = async function (projects) {
    if (!cloudUser) return originalSetAll(projects);
    await cloudSetProjects(cloudUser.uid, projects);
    try { await originalSetAll(projects); } catch (e) {}
  };

  function renderAuthUi(user) {
    const box = document.getElementById("authBox");
    if (!box) return;

    if (user) {
      box.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
          <img src="${user.photoURL || ""}" style="width:38px;height:38px;border-radius:50%;">
          <div style="flex:1;min-width:0;">
            <b style="overflow-wrap:anywhere;">${user.displayName || "Signed in"}</b>
            <small style="font-size:11px;color:var(--muted);display:block;overflow-wrap:anywhere;">${user.email || ""}</small>
          </div>
          <button class="btn secondary" id="authOutBtn" style="padding:8px 12px;font-size:11px;">Sign out</button>
        </div>
      `;
      document.getElementById("authOutBtn").onclick = () => window.signOutGoogle();
    } else {
      box.innerHTML = `<p class="note">Not signed in.</p>`;
    }
  }
})();