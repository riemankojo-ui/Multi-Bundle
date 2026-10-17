/* sync.js — Google login + Firestore-backed project storage */
(function () {
  if (!window.__fb) return; // Wait for Firebase to load
  const { auth, db, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut, doc, getDoc, setDoc } = window.__fb;

  let cloudUser = null;

  window.getCloudUser = () => cloudUser;
  window.isCloudSignedIn = () => !!cloudUser;

  onAuthStateChanged(auth, async (user) => {
    cloudUser = user;
    renderAuthUi(user);

    if (user) {
      await migrateLocalToCloud(user.uid);
      if (typeof window.__refreshProjects === "function") window.__refreshProjects();
    }
  });

  window.signInWithGoogle = async function () {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    try {
      await signInWithPopup(auth, provider);
    } catch (e) {
      if (window.showToast) window.showToast(e.message, "error");
    }
  };

  window.signOutGoogle = async function () {
    await signOut(auth);
  };

  function projectsDoc(uid) {
    return doc(db, "users", uid, "data", "projects");
  }

  async function cloudGetProjects(uid) {
    const snap = await getDoc(projectsDoc(uid));
    return snap.exists() ? snap.data().projects || [] : null;
  }

  async function cloudSetProjects(uid, projects) {
    await setDoc(projectsDoc(uid), { projects, updatedAt: Date.now() });
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
          <img src="${user.photoURL || ""}" alt="" style="width:38px;height:38px;border-radius:50%;flex-shrink:0;">
          <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;">
            <b style="overflow-wrap:anywhere;">${user.displayName || "Signed in"}</b>
            <small style="font-size:11px;color:var(--muted);overflow-wrap:anywhere;">${user.email || ""}</small>
          </div>
          <button class="btn secondary" id="authOutBtn" style="padding:8px 12px;font-size:11px;">Sign out</button>
        </div>
      `;
      document.getElementById("authOutBtn").onclick = () => window.signOutGoogle();
    } else {
      box.innerHTML = `
        <button class="btn primary" id="authInBtn" style="width:100%">Continue with Google</button>
        <p class="note" style="margin:8px 0 0">Sign in to keep your projects across devices.</p>
      `;
      document.getElementById("authInBtn").onclick = () => window.signInWithGoogle();
    }
  }
})();