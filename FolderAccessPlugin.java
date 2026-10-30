package com.multibundle.app;

import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.util.Base64;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

@CapacitorPlugin(name = "FolderAccess")
public class FolderAccessPlugin extends Plugin {

    @PluginMethod
    public void saveAs(PluginCall call) {
        String name = call.getString("name");
        String data = call.getString("data");
        if (name == null || data == null) {
            call.reject("name and data required");
            return;
        }
        String mime = call.getString("mime", "application/octet-stream");
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(mime);
        intent.putExtra(Intent.EXTRA_TITLE, name);
        startActivityForResult(call, intent, "saveAsResult");
    }

    @ActivityCallback
    private void saveAsResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            call.reject("cancelled");
            return;
        }
        Uri uri = result.getData().getData();
        boolean b64 = Boolean.TRUE.equals(call.getBoolean("base64", false));
        OutputStream out = null;
        try {
            String data = call.getString("data");
            out = getContext().getContentResolver().openOutputStream(uri, "wt");
            byte[] bytes = b64 ? Base64.decode(data, Base64.DEFAULT) : data.getBytes("UTF-8");
            out.write(bytes);
            out.flush();
            JSObject ret = new JSObject();
            ret.put("uri", uri.toString());
            call.resolve(ret);
        } catch (Exception e) {
            call.reject(String.valueOf(e.getMessage()));
        } finally {
            try {
                if (out != null) out.close();
            } catch (Exception ignored) {
            }
        }
    }

    @PluginMethod
    public void pickFolder(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(
            Intent.FLAG_GRANT_READ_URI_PERMISSION
                | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
                | Intent.FLAG_GRANT_PREFIX_URI_PERMISSION
        );
        startActivityForResult(call, intent, "pickFolderResult");
    }

    @ActivityCallback
    private void pickFolderResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            call.reject("cancelled");
            return;
        }
        Uri uri = result.getData().getData();
        try {
            getContext().getContentResolver().takePersistableUriPermission(
                uri,
                Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
            );
        } catch (Exception ignored) {
        }
        String docId = DocumentsContract.getTreeDocumentId(uri);
        String name = docId;
        int slash = name.lastIndexOf('/');
        if (slash >= 0) name = name.substring(slash + 1);
        int colon = name.lastIndexOf(':');
        if (colon >= 0) name = name.substring(colon + 1);
        if (name.isEmpty()) name = "Folder";
        JSObject ret = new JSObject();
        ret.put("uri", uri.toString());
        ret.put("name", name);
        call.resolve(ret);
    }

    @PluginMethod
    public void listFiles(PluginCall call) {
        String tree = call.getString("uri");
        if (tree == null) {
            call.reject("uri required");
            return;
        }
        try {
            Uri treeUri = Uri.parse(tree);
            JSArray files = new JSArray();
            walk(treeUri, DocumentsContract.getTreeDocumentId(treeUri), "", files, 0);
            JSObject ret = new JSObject();
            ret.put("files", files);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject(String.valueOf(e.getMessage()));
        }
    }

    private void walk(Uri treeUri, String docId, String prefix, JSArray out, int depth) {
        if (depth > 12 || out.length() > 3000) return;
        Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, docId);
        String[] cols = new String[] {
            DocumentsContract.Document.COLUMN_DOCUMENT_ID,
            DocumentsContract.Document.COLUMN_DISPLAY_NAME,
            DocumentsContract.Document.COLUMN_MIME_TYPE,
            DocumentsContract.Document.COLUMN_SIZE
        };
        Cursor c = null;
        try {
            c = getContext().getContentResolver().query(children, cols, null, null, null);
            if (c == null) return;
            while (c.moveToNext()) {
                String id = c.getString(0);
                String name = c.getString(1);
                String mime = c.getString(2);
                long size = c.getLong(3);
                String path = prefix + name;
                if (DocumentsContract.Document.MIME_TYPE_DIR.equals(mime)) {
                    if (name.equals(".git") || name.equals("node_modules")) continue;
                    walk(treeUri, id, path + "/", out, depth + 1);
                } else {
                    JSObject f = new JSObject();
                    f.put("path", path);
                    f.put("name", name);
                    f.put("size", size);
                    f.put("id", id);
                    f.put("parentId", docId);
                    f.put("uri", DocumentsContract.buildDocumentUriUsingTree(treeUri, id).toString());
                    out.put(f);
                }
            }
        } finally {
            if (c != null) c.close();
        }
    }

    @PluginMethod
    public void readFile(PluginCall call) {
        String u = call.getString("uri");
        if (u == null) {
            call.reject("uri required");
            return;
        }
        boolean b64 = Boolean.TRUE.equals(call.getBoolean("base64", false));
        InputStream in = null;
        try {
            in = getContext().getContentResolver().openInputStream(Uri.parse(u));
            ByteArrayOutputStream buf = new ByteArrayOutputStream();
            byte[] tmp = new byte[16384];
            int n;
            while ((n = in.read(tmp)) != -1) buf.write(tmp, 0, n);
            byte[] bytes = buf.toByteArray();
            JSObject ret = new JSObject();
            ret.put("data", b64 ? Base64.encodeToString(bytes, Base64.NO_WRAP) : new String(bytes, "UTF-8"));
            call.resolve(ret);
        } catch (Exception e) {
            call.reject(String.valueOf(e.getMessage()));
        } finally {
            try {
                if (in != null) in.close();
            } catch (Exception ignored) {
            }
        }
    }

    @PluginMethod
    public void writeFile(PluginCall call) {
        String u = call.getString("uri");
        String data = call.getString("data");
        if (u == null || data == null) {
            call.reject("uri and data required");
            return;
        }
        boolean b64 = Boolean.TRUE.equals(call.getBoolean("base64", false));
        OutputStream out = null;
        try {
            out = getContext().getContentResolver().openOutputStream(Uri.parse(u), "wt");
            byte[] bytes = b64 ? Base64.decode(data, Base64.DEFAULT) : data.getBytes("UTF-8");
            out.write(bytes);
            out.flush();
            call.resolve();
        } catch (Exception e) {
            call.reject(String.valueOf(e.getMessage()));
        } finally {
            try {
                if (out != null) out.close();
            } catch (Exception ignored) {
            }
        }
    }

    @PluginMethod
    public void createFile(PluginCall call) {
        String tree = call.getString("treeUri");
        String parentId = call.getString("parentId");
        String name = call.getString("name");
        if (tree == null || parentId == null || name == null) {
            call.reject("treeUri, parentId and name required");
            return;
        }
        try {
            Uri parent = DocumentsContract.buildDocumentUriUsingTree(Uri.parse(tree), parentId);
            Uri created = DocumentsContract.createDocument(
                getContext().getContentResolver(), parent, "application/octet-stream", name
            );
            if (created == null) {
                call.reject("could not create file");
                return;
            }
            JSObject ret = new JSObject();
            ret.put("uri", created.toString());
            call.resolve(ret);
        } catch (Exception e) {
            call.reject(String.valueOf(e.getMessage()));
        }
    }
}
