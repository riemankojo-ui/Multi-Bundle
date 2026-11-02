/* Multi Bundle - Build APK (Bundle tab).
   Commits a workflow to the project's GitHub repo, runs it, and links the finished debug APK. */
(function(){
'use strict';
var WF='build-apk.yml',WF_PATH='.github/workflows/'+WF;
var YML=[
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
'          cp "$RUNNER_TEMP/cap/android/app/build/outputs/apk/debug/app-debug.apk" "$RUNNER_TEMP/app.apk"',
'          gh release create "apk-${{ github.run_number }}" "$RUNNER_TEMP/app.apk" --title "APK build ${{ github.run_number }}" --notes "$APP_NAME $VERSION" --target "$GITHUB_SHA"',
''].join('\n');

function $(id){return document.getElementById(id)}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function toast(m,t){if(window.showToast)window.showToast(m,t)}
function tk(){return window.getToken?window.getToken():''}
function sleep(ms){return new Promise(function(r){setTimeout(r,ms)})}
function b64u(s){return btoa(unescape(encodeURIComponent(s)))}
function fromB64u(s){return decodeURIComponent(escape(atob(s.replace(/\s/g,''))))}
async function gh(method,path,body){
  var r=await fetch('https://api.github.com'+path,{method:method,headers:{'Accept':'application/vnd.github+json','Authorization':'Bearer '+tk(),'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
  var d=null;try{d=await r.json()}catch(e){}
  if(!r.ok){var er=new Error((d&&d.message)||('HTTP '+r.status));er.status=r.status;throw er}
  return d;
}
async function curProject(){
  var id=(typeof currentProjectId!=='undefined')?currentProjectId:null;
  var list=await dbGetAll();
  return list.find(function(p){return p.id===id})||null;
}
function defId(repo){
  var pr=(repo||'').split('/');
  var o=(pr[0]||'me').toLowerCase().replace(/[^a-z0-9]/g,'');
  var n=(pr[1]||'app').toLowerCase().replace(/[^a-z0-9]/g,'');
  if(!/^[a-z]/.test(o))o='x'+o;
  if(!/^[a-z]/.test(n))n='a'+n;
  return 'com.'+o+'.'+n;
}

var S={stop:false};
function chk(){if(S.stop)throw new Error('stopped')}

async function build(p,v,say){
  var repo=p.githubRepo,br=p.githubBranch||'main';
  say('Checking repo\u2026');
  var info=await gh('GET','/repos/'+repo);
  if(info.permissions&&info.permissions.push===false)throw new Error('Your GitHub account cannot write to '+repo+'.');
  chk();
  var cur=null;
  try{cur=await gh('GET','/repos/'+repo+'/contents/'+WF_PATH+'?ref='+encodeURIComponent(br))}catch(e){if(e.status!==404)throw e}
  var same=false;
  try{same=!!(cur&&cur.content&&fromB64u(cur.content)===YML)}catch(e){}
  if(!same){
    say('Adding build workflow\u2026');
    try{
      await gh('PUT','/repos/'+repo+'/contents/'+WF_PATH,{message:'Add APK build workflow',content:b64u(YML),branch:br,sha:cur?cur.sha:undefined});
    }catch(e){
      if(e.status===404||e.status===403)throw new Error('GitHub refused the workflow file. Sign in again in the GitHub tab so the token has the workflow permission.');
      throw e;
    }
    await sleep(4000);chk();
  }
  var before=0;
  try{
    var r0=await gh('GET','/repos/'+repo+'/actions/workflows/'+WF+'/runs?per_page=5');
    (r0.workflow_runs||[]).forEach(function(r){if(r.id>before)before=r.id});
  }catch(e){}
  say('Starting build\u2026');
  var ok=false,lastErr=null,i;
  for(i=0;i<8&&!ok;i++){
    chk();
    try{
      await gh('POST','/repos/'+repo+'/actions/workflows/'+WF+'/dispatches',{ref:br,inputs:{app_name:v.name,app_id:v.id,version:v.ver}});
      ok=true;
    }catch(e){lastErr=e;if(e.status===404||e.status===422)await sleep(3000);else throw e}
  }
  if(!ok)throw lastErr||new Error('Could not start the build.');
  var run=null;
  for(i=0;i<20&&!run;i++){
    await sleep(3000);chk();
    var rs=await gh('GET','/repos/'+repo+'/actions/workflows/'+WF+'/runs?event=workflow_dispatch&per_page=5');
    run=(rs.workflow_runs||[]).find(function(r){return r.id>before})||null;
  }
  if(!run)throw new Error('The build did not start. Check the Actions tab on GitHub.');
  var t0=Date.now();
  while(true){
    chk();
    run=await gh('GET','/repos/'+repo+'/actions/runs/'+run.id);
    var mins=Math.floor((Date.now()-t0)/60000),secs=Math.floor((Date.now()-t0)/1000)%60;
    if(run.status==='completed')break;
    say((run.status==='queued'?'Waiting for GitHub to start':'Building APK')+'\u2026 '+mins+'m '+secs+'s (first build takes about 5-8 min)');
    if(Date.now()-t0>40*60000)throw new Error('The build is taking too long. Check the Actions tab on GitHub.');
    await sleep(10000);
  }
  if(run.conclusion!=='success')return {fail:true,run:run.html_url,why:run.conclusion};
  var rel=null;
  for(i=0;i<5&&!rel;i++){
    try{rel=await gh('GET','/repos/'+repo+'/releases/tags/apk-'+run.run_number)}catch(e){await sleep(3000)}
  }
  var asset=rel&&(rel.assets||[]).find(function(a){return /\.apk$/i.test(a.name)});
  if(!asset)return {fail:true,run:run.html_url,why:'APK file not found in the release'};
  return {url:asset.browser_download_url,run:run.html_url};
}

async function openSheet(){
  if(!tk()){toast('Connect GitHub first (GitHub tab).','error');return}
  var p=await curProject();
  if(!p){toast('Open a project first.','error');return}
  if(!p.githubRepo){toast('Publish this project to GitHub first (Publish tab).','error');return}
  var saved={};try{saved=JSON.parse(localStorage.getItem('mb_apk_'+p.id)||'{}')}catch(e){}
  var vals={name:saved.name||p.name||'App',id:saved.id||defId(p.githubRepo),ver:saved.ver||'1.0.0'};
  S.stop=false;
  var b=document.createElement('div');
  b.style.cssText='position:fixed;inset:0;z-index:9500;background:rgba(0,0,0,.62);display:flex;align-items:flex-end;justify-content:center';
  var c=document.createElement('div');
  c.style.cssText='width:100%;max-width:560px;max-height:86vh;overflow:auto;background:#15161a;border:1px solid #2a2b32;border-radius:18px 18px 0 0;padding:16px;box-sizing:border-box;font-family:system-ui,sans-serif;color:#fff';
  var bs='padding:12px;border-radius:12px;font-size:13px;font-weight:800;font-family:inherit;cursor:pointer;border:1px solid #303139;background:#20222a;color:#fff';
  var is='width:100%;box-sizing:border-box;background:#101115;color:#fff;border:1px solid #303139;border-radius:10px;padding:11px;font-size:14px;font-family:inherit;outline:0;margin:4px 0 10px';
  var ls='font-size:11px;font-weight:800;letter-spacing:1px;color:#9a9ca6';
  c.innerHTML='<div style="font-size:11px;font-weight:800;letter-spacing:2px;color:#f01424">BUILD APK</div>'+
    '<div style="font-size:18px;font-weight:800;margin:2px 0 2px;overflow-wrap:anywhere">'+esc(p.name||'Untitled')+'</div>'+
    '<div style="font-size:12px;color:#9a9ca6;margin-bottom:12px">Repo: '+esc(p.githubRepo)+' \u00b7 branch: '+esc(p.githubBranch||'main')+'</div>'+
    '<div id="apkForm"><div style="'+ls+'">APP NAME</div><input id="apkName" style="'+is+'" value="'+esc(vals.name)+'" autocomplete="off">'+
    '<div style="'+ls+'">PACKAGE ID</div><input id="apkId" style="'+is+'" value="'+esc(vals.id)+'" autocomplete="off" autocapitalize="off">'+
    '<div style="'+ls+'">VERSION</div><input id="apkVer" style="'+is+'" value="'+esc(vals.ver)+'" autocomplete="off"></div>'+
    '<div id="apkMsg" style="font-size:13px;line-height:1.5;margin:4px 0 12px;color:#c9cad1;overflow-wrap:anywhere"></div>'+
    '<div style="display:flex;gap:8px"><button id="apkClose" style="'+bs+';flex:1">Close</button><button id="apkGo" style="'+bs+';flex:2;background:#f01424;border:0">Build APK</button></div>';
  b.appendChild(c);document.body.appendChild(b);
  var msg=c.querySelector('#apkMsg'),go=c.querySelector('#apkGo'),busy=false;
  function say(t){msg.textContent=t}
  function close(){S.stop=true;b.remove()}
  c.querySelector('#apkClose').onclick=close;
  b.onclick=function(e){if(e.target===b&&!busy)close()};
  go.onclick=async function(){
    if(busy)return;
    var v={name:c.querySelector('#apkName').value.trim(),id:c.querySelector('#apkId').value.trim(),ver:c.querySelector('#apkVer').value.trim()};
    if(!v.name){say('Enter an app name.');return}
    if(!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(v.id)){say('Package ID must look like com.yourname.app (lowercase letters, numbers, dots).');return}
    if(!/^\d+(\.\d+){0,2}$/.test(v.ver)){say('Version must look like 1.0.0.');return}
    try{localStorage.setItem('mb_apk_'+p.id,JSON.stringify(v))}catch(e){}
    busy=true;go.disabled=true;go.style.opacity='.5';c.querySelector('#apkForm').style.display='none';
    try{
      var res=await build(p,v,say);
      if(res.fail){
        msg.innerHTML='Build failed ('+esc(res.why)+'). <a href="'+esc(res.run)+'" target="_blank" rel="noopener" style="color:#f01424;font-weight:800">Open the log</a> and send me the red error lines.';
      }else{
        msg.innerHTML='APK is ready.<br><a href="'+esc(res.url)+'" target="_blank" rel="noopener" style="display:inline-block;margin-top:10px;padding:12px 16px;border-radius:12px;background:#f01424;color:#fff;font-weight:800;text-decoration:none">Download APK</a>'+
          '<div style="font-size:12px;color:#9a9ca6;margin-top:10px">Open the file on your phone and allow "install unknown apps" if Android asks. Private repo: stay signed in to GitHub in your browser.</div>';
        toast('APK built','success');
      }
    }catch(e){
      if(e&&e.message==='stopped')return;
      msg.textContent=(e&&e.message)||'Something went wrong.';
      c.querySelector('#apkForm').style.display='';
    }
    busy=false;go.disabled=false;go.style.opacity='1';go.textContent='Build again';
  };
}

function ensureCard(){
  var page=$('bundlePage');if(!page||$('apkCard'))return;
  var c=document.createElement('section');c.className='card';c.id='apkCard';
  c.innerHTML='<label class="eyebrow">ANDROID</label><h2>Build APK</h2><p class="note" style="margin:4px 0 12px">Turns the current project into an installable Android app using GitHub. The project must be published to GitHub first.</p><button id="apkBtn" class="btn primary">Build APK</button>';
  page.appendChild(c);
  $('apkBtn').onclick=openSheet;
}
var orig=window.showTab;
if(typeof orig==='function'){
  window.showTab=function(name){var r=orig.apply(this,arguments);if(name==='bundle')ensureCard();return r};
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ensureCard);else ensureCard();
})();
