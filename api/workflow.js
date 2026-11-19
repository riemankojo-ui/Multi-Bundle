const { requireAuth } = require('./_auth');
const { getGithubToken, checkAccess, gh, validRepo } = require('./_github');

const APK_LINES = [
  'name: Build APK',
  'on:',
  '  workflow_dispatch:',
  '    inputs:',
  '      app_name:',
  '        description: App name',
  '        required: true',
  '        default: App',
  '      app_id:',
  '        description: Package ID',
  '        required: true',
  '        default: com.example.app',
  '      version:',
  '        description: Version',
  '        required: true',
  '        default: 1.0.0',
  'permissions:',
  '  contents: write',
  'jobs:',
  '  apk:',
  '    runs-on: ubuntu-latest',
  '    env:',
  '      APP_NAME: ${{ inputs.app_name }}',
  '      APP_ID: ${{ inputs.app_id }}',
  '      VERSION: ${{ inputs.version }}',
  '      VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}',
  '      VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}',
  '    steps:',
  '      - uses: actions/checkout@v4',
  '      - uses: actions/setup-node@v4',
  '        with:',
  '          node-version: 22',
  '      - uses: actions/setup-java@v4',
  '        with:',
  '          distribution: temurin',
  '          java-version: 21',
  '      - name: Prepare web files',
  '        run: |',
  '          mkdir -p "$RUNNER_TEMP/www"',
  '          if [ -f package.json ] && grep -q \'"build"\' package.json; then',
  '            npm install',
  '            npm run build',
  '            if [ -d dist ]; then cp -r dist/. "$RUNNER_TEMP/www/"; else cp -r build/. "$RUNNER_TEMP/www/"; fi',
  '          else',
  '            tar --exclude=.git --exclude=.github -cf - . | tar -xf - -C "$RUNNER_TEMP/www"',
  '          fi',
  '      - name: Create Android project',
  '        run: |',
  '          mkdir "$RUNNER_TEMP/cap"',
  '          cd "$RUNNER_TEMP/cap"',
  '          npm init -y',
  '          npm install @capacitor/core@8 @capacitor/cli@8 @capacitor/android@8',
  '          mv "$RUNNER_TEMP/www" www',
  '          npx cap init "$APP_NAME" "$APP_ID" --web-dir www',
  '          npx cap add android',
  '          if [ -f "$GITHUB_WORKSPACE/FolderAccessPlugin.java" ]; then',
  '            PKG_DIR="android/app/src/main/java/$(echo "$APP_ID" | tr . /)"',
  '            mkdir -p "$PKG_DIR"',
  '            sed "s/^package .*/package $APP_ID;/" "$GITHUB_WORKSPACE/FolderAccessPlugin.java" > "$PKG_DIR/FolderAccessPlugin.java"',
  '            printf \'%s\\n\' "package $APP_ID;" "" "import android.os.Bundle;" "import com.getcapacitor.BridgeActivity;" "" "public class MainActivity extends BridgeActivity {" "    @Override" "    public void onCreate(Bundle savedInstanceState) {" "        registerPlugin(FolderAccessPlugin.class);" "        super.onCreate(savedInstanceState);" "    }" "}" > "$PKG_DIR/MainActivity.java"',
  '          fi',
  '          npx cap sync android',
  '          sed -i "s/versionName \\".*\\"/versionName \\"$VERSION\\"/; s/versionCode [0-9]*/versionCode ${{ github.run_number }}/" android/app/build.gradle',
  '      - name: Build debug APK',
  '        run: |',
  '          cd "$RUNNER_TEMP/cap/android"',
  '          chmod +x gradlew',
  '          ./gradlew assembleDebug',
  '      - name: Publish release',
  '        env:',
  '          GH_TOKEN: ${{ github.token }}',
  '        run: |',
  '          SAFE=$(printf "%s" "$APP_NAME" | tr -c "A-Za-z0-9._-" "-" | sed "s/--*/-/g; s/^-//; s/-$//"); [ -n "$SAFE" ] || SAFE=app',
  '          cp "$RUNNER_TEMP/cap/android/app/build/outputs/apk/debug/app-debug.apk" "$RUNNER_TEMP/$SAFE.apk"',
  '          gh release create "apk-${{ github.run_number }}" "$RUNNER_TEMP/$SAFE.apk" --title "APK build ${{ github.run_number }}" --notes "$APP_NAME $VERSION" --target "$GITHUB_SHA"'
];

const TEMPLATES = {
  apk: { path: '.github/workflows/build-apk.yml', file: 'build-apk.yml', yml: APK_LINES.join('\n') + '\n' },
};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key, x-api-secret');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    await handle(req, res);
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};

async function handle(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });
  const uid = await requireAuth(req, res);
  if (!uid) return;

  const { repo, template, app_name, app_id, version, run } = req.body || {};
  if (!validRepo(repo)) {
    return res.status(400).json({ error: 'Send repo as owner/name, for example myname/my-repo' });
  }
  const tpl = TEMPLATES[String(template || 'apk')];
  if (!tpl) {
    return res.status(400).json({ error: 'Unknown template. Available: ' + Object.keys(TEMPLATES).join(', ') });
  }
  const name = String(app_name || 'App').trim().slice(0, 60);
  const id = String(app_id || 'com.example.app').trim();
  const ver = String(version || '1.0.0').trim();
  if (!/^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/.test(id)) {
    return res.status(400).json({ error: 'app_id must look like com.myname.myapp' });
  }
  if (!/^[0-9]+(\.[0-9]+){0,3}$/.test(ver)) {
    return res.status(400).json({ error: 'version must look like 1.0.0' });
  }

  const access = await checkAccess(req, 'workflow', repo);
  if (!access.ok) return res.status(403).json({ error: access.error });

  const token = await getGithubToken(uid);
  if (!token) {
    return res.status(400).json({ error: 'Connect GitHub in Multi Bundle first' });
  }

  const info = await gh(token, '/repos/' + repo);
  if (info.status === 401) {
    return res.status(401).json({ error: 'Your saved GitHub access stopped working. Reconnect GitHub in Multi Bundle.' });
  }
  if (!info.ok) {
    return res.status(404).json({ error: 'Repo not found or no access: ' + repo });
  }
  const branch = info.data.default_branch || 'main';

  const enc = tpl.path.split('/').map(encodeURIComponent).join('/');
  const cur = await gh(token, '/repos/' + repo + '/contents/' + enc + '?ref=' + encodeURIComponent(branch));
  const body = {
    message: 'Add ' + tpl.file + ' from Multi Bundle API',
    content: Buffer.from(tpl.yml, 'utf8').toString('base64'),
    branch,
  };
  if (cur.ok && cur.data && cur.data.sha) body.sha = cur.data.sha;
  const put = await gh(token, '/repos/' + repo + '/contents/' + enc, { method: 'PUT', body: JSON.stringify(body) });
  if (!put.ok) {
    return res.status(502).json({ error: (put.data && put.data.message) || ('GitHub status ' + put.status) });
  }

  const out = {
    ok: true,
    repo,
    branch,
    workflow: tpl.path,
    created: !body.sha,
    actionsUrl: 'https://github.com/' + repo + '/actions',
  };

  if (run) {
    await new Promise(r => setTimeout(r, 2500));
    const d = await gh(token, '/repos/' + repo + '/actions/workflows/' + tpl.file + '/dispatches', {
      method: 'POST',
      body: JSON.stringify({ ref: branch, inputs: { app_name: name, app_id: id, version: ver } }),
    });
    out.started = d.ok;
    if (!d.ok) out.runError = (d.data && d.data.message) || ('GitHub status ' + d.status);
  }
  return res.status(200).json(out);
}