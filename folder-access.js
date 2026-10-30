// Phone folder access for the Android app (Acode style).
// In a normal browser FolderAccess.available is false and nothing happens.
(function () {
  var cap = window.Capacitor;
  var native = !!(cap && cap.isNativePlatform && cap.isNativePlatform());
  var P = native ? cap.registerPlugin('FolderAccess') : null;

  var BINARY = /\.(png|jpe?g|gif|webp|ico|bmp|svg2|mp3|wav|ogg|m4a|mp4|webm|woff2?|ttf|otf|zip|pdf)$/i;
  var MAX_BYTES = 8 * 1024 * 1024;

  function isBinary(name) { return BINARY.test(name); }

  // Pick a folder once and read every file in it.
  // Returns { name, treeUri, files: [{ path, name, uri, parentId, binary, text|base64 }] }
  async function importFolder() {
    if (!P) throw new Error('Phone folder access works in the Android app only');
    var picked = await P.pickFolder();
    try { localStorage.setItem('mb_folder_uri', picked.uri); } catch (e) {}
    return loadFolder(picked.uri, picked.name);
  }

  async function loadFolder(treeUri, name) {
    var list = await P.listFiles({ uri: treeUri });
    var out = [];
    for (var i = 0; i < list.files.length; i++) {
      var f = list.files[i];
      if (f.size > MAX_BYTES) continue;
      var bin = isBinary(f.name);
      try {
        var r = await P.readFile({ uri: f.uri, base64: bin });
        var item = { path: f.path, name: f.name, uri: f.uri, parentId: f.parentId, binary: bin };
        if (bin) item.base64 = r.data; else item.text = r.data;
        out.push(item);
      } catch (e) { /* skip unreadable files */ }
    }
    return { name: name || 'Folder', treeUri: treeUri, files: out };
  }

  // Save changes back to the real file on the phone.
  async function saveFile(file, content) {
    if (!P) throw new Error('Phone folder access works in the Android app only');
    if (file.binary) return P.writeFile({ uri: file.uri, data: content, base64: true });
    return P.writeFile({ uri: file.uri, data: content });
  }

  // Create a new file inside the folder, then write it.
  async function saveNewFile(treeUri, parentId, name, content) {
    var r = await P.createFile({ treeUri: treeUri, parentId: parentId, name: name });
    await P.writeFile({ uri: r.uri, data: content });
    return r.uri;
  }

  function lastFolderUri() {
    try { return localStorage.getItem('mb_folder_uri'); } catch (e) { return null; }
  }

  window.FolderAccess = {
    available: native,
    importFolder: importFolder,
    loadFolder: loadFolder,
    saveFile: saveFile,
    saveNewFile: saveNewFile,
    lastFolderUri: lastFolderUri
  };
})();
