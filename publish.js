/* Multi Bundle - Publish to GitHub (one commit via the Git Data API). */
(function(){
'use strict';
var $=function(id){return document.getElementById(id)};
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function toast(m,t){if(window.showToast)window.showToast(m,t)}
function pid(){if(window.__pbOv&&window.__pbOv.pid)return window.__pbOv.pid;return (typeof currentProjectId!=='undefined')?currentProjectId:null}
function curFiles(){if(window.__pbOv&&window.__pbOv.files)return window.__pbOv.files;return (typeof files!=='undefined'&&Array.isArray(files))?files:[]}
function token(){return (typeof getToken==='function')?getToken():''}
function isRepo(r){return /^[\w.-]+\/[\w.-]+$/.test(r||'')}
function brPath(b){return b.split('/').map(encodeURIComponent).join('/')}

/* ---------- GitHub API ---------- */
async function gh(method,path,body){
  var r=await fetch('https://api.github.com'+path,{
    method:method,
    headers:{'Accept':'application/vnd.github+json','Authorization':'Bearer '+token(),'Content-Type':'application/json'},
    body:body?JSON.stringify(body):undefined
  });
  var data=null;try{data=await r.json()}catch(e){}
  if(!r.ok){var err=new Error((data&&data.message)||('HTTP '+r.status));err.status=r.status;err.where=method+' '+path;throw err}
  return data;
}
function explain(e,write){
  if(e&&e.status===-2)return 'Your token is missing the repo permission. It only has: '+(e.have&&e.have.length?e.have.join(', '):'nothing')+'. Open github.com/settings/tokens, tap your token, tick repo, then tap Update token.';
  if(e&&e.status===-1)return 'Your token can read this repo but cannot write to it. Make sure the token has the repo box ticked and was created by an account that owns this repo or is a collaborator.';
  if(write&&e&&e.status===404)return 'GitHub refused the upload. This usually means your token cannot write to this repo. Check that it has the repo box ticked and belongs to the repo owner or a collaborator.'+detail(e);
  if(e&&e.status===401)return 'GitHub rejected your token. Sign in again in the GitHub tab.';
  if(e&&e.status===403)return 'GitHub refused access ('+e.message+'). Your token needs the repo scope, and the branch may be protected.';
  if(e&&e.status===404)return 'Repo or branch not found. For private repos your token needs access to it.';
  if(e&&e.status===409)return 'This repo is empty. Add a first file (like a README) on GitHub, then try again.';
  if(e&&e.status===422)return 'GitHub changed while publishing, or the branch is protected. Tap Check changes and try again.';
  return (e&&e.message)||'Something went wrong';
}
function detail(e){return (e&&e.where)?' [GitHub said: '+e.message+' at '+e.where+']':''}

/* ---------- hashing (same as git hash-object) ---------- */
async function sha1blob(bytes){
  var pre=new TextEncoder().encode('blob '+bytes.length+'\0');
  var all=new Uint8Array(pre.length+bytes.length);all.set(pre);all.set(bytes,pre.length);
  var d=await crypto.subtle.digest('SHA-1',all);
  return Array.from(new Uint8Array(d)).map(function(x){return x.toString(16).padStart(2,'0')}).join('');
}
async function fileBytes(f){
  if(f.blob)return new Uint8Array(await f.blob.arrayBuffer());
  if(f.text!=null)return new TextEncoder().encode(f.text);
  return null;
}
function b64(bytes){var s='',C=0x8000;for(var i=0;i<bytes.length;i+=C)s+=String.fromCharCode.apply(null,bytes.subarray(i,i+C));return btoa(s)}

/* ---------- core logic ---------- */
async function computeScan(repo,branch,p,fl){
  var pInfo=gh('GET','/repos/'+repo);
var pUser=fetch('https://api.github.com/user',{headers:{'Authorization':'Bearer '+token(),'Accept':'application/vnd.github+json'}});
var pRef=gh('GET','/repos/'+repo+'/git/ref/heads/'+brPath(branch));
pUser.catch(function(){});pRef.catch(function(){});
var info=await pInfo;
  if(info.permissions&&info.permissions.push===false){var pe=new Error('no write access');pe.status=-1;throw pe}
  var ur=await pUser;
  var sc=ur.headers.get('x-oauth-scopes');
  if(sc!==null){
    var have=sc.split(',').map(function(x){return x.trim()}).filter(Boolean);
    if(have.indexOf('repo')===-1&&!(info.private===false&&have.indexOf('public_repo')!==-1)){var se=new Error('missing scope');se.status=-2;se.have=have;throw se}
  }
  var br=brPath(branch);
  var ref=await pRef;
  var headSha=ref.object.sha;
  var commit=null;
  var treeSha=null;
  var tree;
try{tree=await gh('GET','/repos/'+repo+'/git/trees/'+headSha+'?recursive=1');treeSha=tree.sha}
catch(e1){commit=await gh('GET','/repos/'+repo+'/git/commits/'+headSha);treeSha=commit.tree.sha;tree=await gh('GET','/repos/'+repo+'/git/trees/'+treeSha+'?recursive=1')}
  if(tree.truncated){var te=new Error('This repo is too large to compare here.');te.status=0;throw te}
  var remote={};
  (tree.tree||[]).forEach(function(n){if(n.type==='blob')remote[n.path]={sha:n.sha,mode:n.mode}});
  var base=(p&&p.githubRepo===repo&&(p.githubBranch||'main')===branch&&p.githubShas)?p.githubShas:null;
var hm={};
await Promise.all(fl.map(async function(f){var bb=await fileBytes(f);if(bb)hm[f.path]=await sha1blob(bb)}));
  var rows=[];
  for(var i=0;i<fl.length;i++){
    var f=fl[i];if(hm[f.path]==null)continue;
    var ls=hm[f.path];var rem=remote[f.path];
    if(rem&&rem.sha===ls)continue;
    if(base&&base[f.path]===ls)continue;
    var conflict=base?(!!rem&&base[f.path]!==rem.sha):false;
    rows.push({path:f.path,f:f,ls:ls,isNew:!rem,conflict:conflict,on:!conflict});
  }
  if(p&&p.githubRepo===repo&&(p.githubBranch||'main')===branch&&Array.isArray(p.deletedPaths)){
    var have={},seenDel={};fl.forEach(function(f){have[f.path]=1});
    p.deletedPaths.forEach(function(pth){
      if(have[pth]||seenDel[pth]||!remote[pth])return;
      seenDel[pth]=1;
      var cf=base?(base[pth]!==remote[pth].sha):false;
      rows.push({path:pth,f:null,ls:null,isNew:false,isDel:true,conflict:cf,on:!cf});
    });
  }
  return {scan:{headSha:headSha,treeSha:treeSha,remote:remote,base:base,repo:repo,branch:branch},rows:rows};
}
async function pushRows(scan,rows,msg,onProgress){
  var sel=rows.filter(function(r){return r.on});
  var entries=[],done=0,idx=0;
  async function worker(){
    while(idx<sel.length){
      var r=sel[idx++];
      if(r.isDel){var rem0=scan.remote[r.path];entries.push({path:r.path,mode:(rem0&&rem0.mode)||'100644',type:'blob',sha:null});done++;if(onProgress)onProgress('Uploading '+done+'/'+sel.length+'\u2026');continue}
      var bytes=await fileBytes(r.f);
      var b=await gh('POST','/repos/'+scan.repo+'/git/blobs',{content:b64(bytes),encoding:'base64'});
      var rem=scan.remote[r.path];
      entries.push({path:r.path,mode:(rem&&rem.mode)||'100644',type:'blob',sha:b.sha});
      done++;if(onProgress)onProgress('Uploading '+done+'/'+sel.length+'\u2026');
    }
  }
  await Promise.all([worker(),worker(),worker(),worker(),worker()]);
  if(onProgress)onProgress('Creating commit\u2026');
  var tree=await gh('POST','/repos/'+scan.repo+'/git/trees',{base_tree:scan.treeSha,tree:entries});
  var commit=await gh('POST','/repos/'+scan.repo+'/git/commits',{message:msg,tree:tree.sha,parents:[scan.headSha]});
  await gh('PATCH','/repos/'+scan.repo+'/git/refs/heads/'+brPath(scan.branch),{sha:commit.sha,force:false});
  return {sha:commit.sha,count:sel.length};
}
async function saveRecord(scan,rows){
  var list=await dbGetAll();var p=list.find(function(x){return x.id===pid()});if(!p)return;
  var nb={};
  if(scan.base){for(var k in scan.base)nb[k]=scan.base[k]}
  else{Object.keys(scan.remote).forEach(function(k){nb[k]=scan.remote[k].sha})}
  var all=true;
  rows.forEach(function(r){if(r.on){if(r.isDel)delete nb[r.path];else nb[r.path]=r.ls}else all=false});
  if(p.deletedPaths){var gone={};rows.forEach(function(r){if(r.isDel&&r.on)gone[r.path]=1});p.deletedPaths=p.deletedPaths.filter(function(x){return !gone[x]&&scan.remote[x]})}
  p.githubRepo=scan.repo;p.githubBranch=scan.branch;p.source='github';p.githubShas=nb;
  if(all)p.lastImport=Date.now();
  await dbSetAll(list);
}

/* ---------- sheet UI ---------- */
var S={scan:null,rows:[],busy:false};
function setNote(t,cls){var n=$('pbNote');if(n){n.textContent=t||'';n.className='pb-note'+(cls?' '+cls:'')}}
function setStatus(t){var n=$('pbStatus');if(n)n.textContent=t||''}
function closeSheet(){var b=$('pbBack');if(b)b.remove();S.busy=false;S.armed=false;clearTimeout(S.armT)}
function updateGo(){updateRestore();
  var n=S.rows.filter(function(r){return r.on}).length;var g=$('pbGo');if(!g)return;
  g.disabled=!n||S.busy;g.textContent=n?('Publish '+n+' file'+(n===1?'':'s')):'Publish';
}
function renderRows(){
  var box=$('pbList');if(!box)return;
  box.innerHTML=S.rows.map(function(r,i){
    var tag=r.isDel?(r.conflict?'<span class="pb-tag warn">Changed on GitHub</span>':'<span class="pb-tag del">Delete</span>'):(r.conflict?'<span class="pb-tag warn">Also changed on GitHub</span>':(r.isNew?'<span class="pb-tag new">New</span>':'<span class="pb-tag mod">Changed</span>'));
    return '<label class="pb-row"><input type="checkbox" data-i="'+i+'"'+(r.on?' checked':'')+'><span class="pb-path">'+esc(r.path)+'</span>'+tag+'</label>';
  }).join('');
  box.querySelectorAll('input[type=checkbox]').forEach(function(c){
    c.onchange=function(){S.rows[parseInt(c.dataset.i,10)].on=c.checked;updateGo()};
  });
  updateGo();
}
function disarm(reset){
  var was=S.armed;S.armed=false;clearTimeout(S.armT);
  var b=$('pbRestore');if(b)b.classList.remove('armed');
  if(was&&reset&&S.prevNote)setNote(S.prevNote[0],S.prevNote[1]);
  S.prevNote=null;
}
function updateRestore(){
  var b=$('pbRestore');if(!b)return;
  var any=S.rows.some(function(r){return !r.isNew&&r.f&&r.f.text!=null});
  b.hidden=!any;b.disabled=!!S.busy;
  if(!any)disarm(false);
}
async function restoreFromGitHub(){
  if(S.busy||!S.scan)return;
  var rows=S.rows.filter(function(r){return !r.isNew&&r.f&&r.f.text!=null});
  if(!rows.length){toast('Nothing to restore from GitHub','error');return}
  var b=$('pbRestore');
  if(!S.armed){
    var nn=$('pbNote');S.prevNote=nn?[nn.textContent,nn.className.replace('pb-note','').trim()]:null;
    S.armed=true;if(b)b.classList.add('armed');
    setNote('Tap the restore icon again to replace '+rows.length+' changed file'+(rows.length===1?'':'s')+' in the editor with the GitHub version. Your current version is saved as a snapshot first, so you can undo this from the Backups tab.','warn');
    clearTimeout(S.armT);S.armT=setTimeout(function(){disarm(true)},7000);
    return;
  }
  disarm(false);
  S.busy=true;updateGo();
  var scan=S.scan,projId=pid(),texts={},idx=0,done=0;
  try{
    var worker=async function(){
      while(idx<rows.length){
        var r=rows[idx++],rem=scan.remote[r.path];if(!rem)continue;
        var bl=await gh('GET','/repos/'+scan.repo+'/git/blobs/'+rem.sha);
        var bin=atob(String(bl.content||'').replace(/\s/g,''));var u8=new Uint8Array(bin.length);
        for(var i=0;i<bin.length;i++)u8[i]=bin.charCodeAt(i);
        texts[r.path]=new TextDecoder('utf-8').decode(u8);
        done++;setStatus('Downloading from GitHub '+done+'/'+rows.length+'\u2026');
      }
    };
    await Promise.all([worker(),worker(),worker()]);
    var paths=Object.keys(texts);
    if(!paths.length)throw new Error('Could not download the GitHub files');
    var recs=await dbGetAll();var p=recs.find(function(x){return x.id===projId});
    if(p){
      p.files=p.files||[];p.snapshots=p.snapshots||[];p.history=p.history||[];
      p.snapshots.unshift({ts:Date.now(),label:'Before restore from GitHub',files:p.files.map(function(f){return{path:f.path,name:f.name,size:f.size,type:f.type,text:f.text,blob:f.blob}})});
      if(p.snapshots.length>20)p.snapshots.length=20;
      paths.forEach(function(path){
        var t=texts[path],f=p.files.find(function(x){return x.path===path});
        if(f){f.text=t;f.blob=null;f.size=t.length}
        else p.files.push({path:path,name:path.split('/').pop(),size:t.length,type:'text/plain',blob:null,text:t});
        p.history.unshift({ts:Date.now(),type:'edit',path:path,note:'Restored from GitHub',text:t.length<300000?t:undefined});
      });
      p.savedAt=Date.now();
      await dbSetAll(recs);
      if(typeof __flushProjects==='function')await __flushProjects();
    }
    rows.forEach(function(r){var t=texts[r.path];if(t!=null){r.f.text=t;r.f.blob=null;r.f.size=t.length}});
    paths.forEach(function(path){try{localStorage.removeItem('mb_draft_'+projId+'_'+path)}catch(e1){}});
    if(typeof window.__edReloadCurrent==='function')window.__edReloadCurrent(paths);
    if(typeof window.renderProjectCards==='function')window.renderProjectCards();
    if(typeof populatePages==='function')populatePages();
    if(typeof render==='function')render();
    toast('Restored '+paths.length+' file'+(paths.length===1?'':'s')+' from GitHub','success');
    setStatus('');S.busy=false;
    await runScan();
  }catch(e){S.busy=false;setStatus('');setNote(explain(e),'bad');updateGo()}
}
async function runScan(){
  var repo=($('pbRepo').value||'').trim(),branch=($('pbBranch').value||'').trim()||'main';
  if(!isRepo(repo)){setNote('Enter the repo like owner/repo','bad');return}
  setNote('Checking GitHub\u2026');setStatus('');$('pbList').innerHTML='';S.rows=[];S.scan=null;updateGo();
  try{
    var recs=await dbGetAll();var p=recs.find(function(x){return x.id===pid()})||null;
    var r=await computeScan(repo,branch,p,curFiles());
    S.scan=r.scan;S.rows=r.rows;renderRows();
    if(!r.rows.length){setNote('Everything here is already on GitHub.','ok')}
    else{
      var warn=r.rows.filter(function(x){return x.conflict}).length;
      var t=r.rows.length+' file'+(r.rows.length===1?'':'s')+' ready to publish.';var nd=r.rows.filter(function(x){return x.isDel}).length;if(nd)t+=' '+nd+' will be deleted from GitHub.';
      if(!r.scan.base)t+=' No import record for this project, so this lists every file that differs from GitHub. Uncheck anything you do not want to overwrite.';
      if(warn)t+=' '+warn+' also changed on GitHub and is unchecked.';
      setNote(t,warn?'warn':'');
    }
  }catch(e){setNote(explain(e),'bad')}
}
async function runPublish(){
  if(S.busy||!S.scan)return;
  var n=S.rows.filter(function(r){return r.on}).length;if(!n)return;
  S.busy=true;updateGo();
  var msg=($('pbMsg').value||'').trim()||'Update from Multi Bundle';
  try{
    var res=await pushRows(S.scan,S.rows,msg,setStatus);
    await saveRecord(S.scan,S.rows);
    try{var lst=await dbGetAll();var pp=lst.find(function(x){return x.id===pid()});if(pp){pp.publishes=pp.publishes||[];pp.publishes.unshift({ts:Date.now(),msg:msg,repo:S.scan.repo,branch:S.scan.branch,sha:res.sha,files:(function(){var cap=900000;return S.rows.filter(function(r){return r.on}).map(function(r){var o={path:r.path,status:r.isDel?'deleted':(r.isNew?'new':'changed')};var t=r.f&&r.f.text;if(typeof t==='string'&&t.length<=cap){o.text=t;cap-=t.length}return o})})()});pp.publishes=pp.publishes.slice(0,20);await dbSetAll(lst)}}catch(e0){}
    if(!window.__pbOv&&typeof window.logHistory==='function')await window.logHistory({type:'publish',note:'Published '+res.count+' file'+(res.count===1?'':'s')+' to '+S.scan.repo+'@'+S.scan.branch});
    if(typeof window.renderProjectCards==='function')window.renderProjectCards();
    var url='https://github.com/'+S.scan.repo+'/commit/'+res.sha;
    var card=$('pbCard');
    if(card)card.innerHTML='<div class="pb-done"><div class="pb-check">\u2713</div><div class="pb-title">Published</div>'+
      '<div class="pb-note">'+res.count+' file'+(res.count===1?'':'s')+' sent to '+esc(S.scan.repo)+' ('+esc(S.scan.branch)+').</div>'+
      '<a class="pb-link" href="'+esc(url)+'" target="_blank" rel="noopener">View commit \u2197</a>'+
      '<button class="pb-go" id="pbDone">Done</button></div>';
    var d=$('pbDone');if(d)d.onclick=closeSheet;
    toast('Published to GitHub','success');
    S.busy=false;
  }catch(e){S.busy=false;setStatus('');setNote(explain(e,true),'bad');updateGo()}
}
function settingsRepo(){try{return JSON.parse(localStorage.getItem('mb_deploy_'+pid())||'null')||{}}catch(e){return {}}}
function logoBox(p){
  try{
    var lp=p.logo||((typeof detectProjectLogo==='function')?detectProjectLogo(curFiles()):null);
    var lf=lp?curFiles().find(function(f){return f.path===lp}):null;
    if(lf&&typeof fileBlob==='function'){
      if(window.__pbLogoUrl){try{URL.revokeObjectURL(window.__pbLogoUrl)}catch(e1){}}
      var u=URL.createObjectURL(fileBlob(lf));window.__pbLogoUrl=u;
      return '<img src="'+u+'" alt="" style="width:100%;height:100%;object-fit:cover;display:block">';
    }
  }catch(e){}
  return esc((p.name||'?').slice(0,2).toUpperCase());
}
async function openSheet(opts){
  window.__pbOv=(opts&&opts.files)?{pid:opts.pid,files:opts.files}:null;
  if(!pid()||!curFiles().length){toast('Open a project first','error');return}
  closeSheet();
  var recs=await dbGetAll();var p=recs.find(function(x){return x.id===pid()})||{};
  var st=settingsRepo();
  var repo=p.githubRepo||st.repo||'',branch=p.githubBranch||st.branch||'main';
  var back=document.createElement('div');back.id='pbBack';back.className='pb-back';
  var signed=!!token();
  var dirty=false;var es=$('editorStatus');if(es&&/\u2022\s*$/.test(es.textContent||''))dirty=true;
  back.innerHTML='<div class="pb-card" id="pbCard">'+
    '<div class="pb-top"><div><div class="pb-eyebrow">PUBLISH</div><div class="pb-title">Send to GitHub</div></div><div style="display:flex;gap:8px"><button class="pb-x pb-rs" id="pbRestore" hidden title="Restore GitHub files into the editor" aria-label="Restore GitHub files into the editor"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 7v5l3 2"/></svg></button><button class="pb-x" id="pbClose" aria-label="Close">\u2715</button></div></div>'+
    '<div style="display:flex;align-items:center;gap:10px;background:#101115;border:1px solid #25262c;border-radius:12px;padding:10px 12px;margin-bottom:4px"><div style="width:38px;height:38px;border-radius:10px;background:#24252b;display:grid;place-items:center;font-weight:800;font-size:13px;flex-shrink:0;overflow:hidden">'+logoBox(p)+'</div><div style="min-width:0"><div style="font-size:14px;font-weight:800;overflow-wrap:anywhere">'+esc(p.name||'Untitled')+'</div><div style="font-size:11px;color:var(--muted);margin-top:2px;overflow-wrap:anywhere">'+curFiles().length+' file'+(curFiles().length===1?'':'s')+(p.githubRepo?' \u00b7 '+esc(p.githubRepo):' \u00b7 not linked to GitHub yet')+(p.lastImport?' \u00b7 imported '+new Date(p.lastImport).toLocaleDateString():'')+'</div></div></div>'+
(signed?
      '<div class="pb-grid"><div class="pb-f"><label>Repo</label><input id="pbRepo" placeholder="owner/repo" value="'+esc(repo)+'" autocomplete="off" autocapitalize="off"></div>'+
      '<div class="pb-f"><label>Branch</label><input id="pbBranch" placeholder="main" value="'+esc(branch)+'" autocomplete="off" autocapitalize="off"></div></div>'+
      '<button class="pb-mini" id="pbScan">Check changes</button>'+
      '<div class="pb-new"><div class="pb-nt">No repo yet? Create one</div><div class="pb-grid"><div class="pb-f"><label>New repo name</label><input id="pbNewName" placeholder="my-app" value="'+esc(String(p.name||'').trim().replace(/[^\w.-]+/g,'-').replace(/^-+|-+$/g,'').toLowerCase())+'" autocomplete="off" autocapitalize="off"></div><div class="pb-f"><label>Who can see it</label><select id="pbNewVis"><option value="private">Private</option><option value="public">Public</option></select></div></div><button class="pb-go" id="pbCreate">Create repo &amp; publish</button></div>'+
      (dirty?'<div class="pb-note warn">You have unsaved edits in the editor. Tap the save button first so they are included.</div>':'')+
      '<div class="pb-note" id="pbNote"></div><div class="pb-list" id="pbList"></div>'+
      '<div class="pb-f"><label>Commit message</label><input id="pbMsg" value="Update from Multi Bundle" autocomplete="off"></div>'+
      '<div class="pb-status" id="pbStatus"></div><button class="pb-go" id="pbGo" disabled>Publish</button>'
    :
      '<div class="pb-note warn">You are not signed in to GitHub yet. Sign in with your token in the GitHub tab, then come back and tap Publish.</div><button class="pb-go" id="pbToGh">Open GitHub tab</button>')+
    '</div>';
  document.body.appendChild(back);
  back.onclick=function(e){if(e.target===back&&!S.busy)closeSheet()};
  $('pbClose').onclick=function(){if(!S.busy)closeSheet()};
  if(signed){
    $('pbScan').onclick=runScan;$('pbCreate').onclick=createRepo;$('pbGo').onclick=runPublish;$('pbRestore').onclick=restoreFromGitHub;
    if(isRepo(repo))runScan();else setNote('Enter your repo to see what will be published.');
  }else{
    $('pbToGh').onclick=function(){closeSheet();if(typeof window.showTab==='function')window.showTab('github')};
  }
}
function sleep(ms){return new Promise(function(r){setTimeout(r,ms)})}
async function createRepo(){
  if(S.busy)return;
  var name=(($('pbNewName')||{}).value||'').trim();var desc=(($('pbNewDesc')||{}).value||'').trim();var priv=(($('pbNewVis')||{}).value!=='public');
  if(!/^[\w.-]+$/.test(name)){setNote('Use only letters, numbers, dashes, dots and underscores in the repo name.','bad');return}
  var btn=$('pbCreate');S.busy=true;if(btn){btn.disabled=true;btn.textContent='Creating\u2026'}
  try{
    var r=await gh('POST','/user/repos',{name:name,description:desc,private:priv,auto_init:true});
    $('pbRepo').value=r.full_name;$('pbBranch').value=r.default_branch||'main';
    if($('pbMsg'))$('pbMsg').value='Initial commit from Multi Bundle';
    setNote('Repo created. Preparing your files\u2026');
    for(var i=0;i<6&&!S.scan;i++){await sleep(i?1200:800);await runScan()}
    if(!S.scan)throw new Error('Repo created, but GitHub is still setting it up. Tap Check changes in a moment, then Publish.');
    S.busy=false;
    if(S.rows.length)await runPublish();else setNote('Repo created. Nothing else to upload.','ok');
  }catch(e){
    S.busy=false;if(btn){btn.disabled=false;btn.textContent='Create repo & publish'}
    setNote(e&&e.status===422?'You already have a repo with that name. Pick another name.':explain(e,true),'bad');
  }
}
window.openPublish=openSheet;

/* ---------- editor button + styles ---------- */
function injectCss(){
  if($('pbStyle'))return;
  var st=document.createElement('style');st.id='pbStyle';
  st.textContent=[
    '.et-file-row #editorPublishBtn{height:42px;min-width:42px;flex-shrink:0;border-radius:10px;background:#2f3a52;color:#cfe0ff;border-color:#3c4a68}',
    '.pb-back{position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,.62);display:flex;align-items:flex-end;justify-content:center;animation:mb-fade .15s ease}',
    '.pb-card{width:100%;max-width:560px;max-height:92vh;overflow-y:auto;background:#15161a;border:1px solid #2a2b32;border-radius:18px 18px 0 0;padding:16px 16px 22px;box-sizing:border-box}',
    '.pb-top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:12px}',
    '.pb-eyebrow{font-size:10px;font-weight:800;letter-spacing:2px;color:var(--red)}',
    '.pb-title{font-size:18px;font-weight:800;margin-top:2px}',
    '.pb-x{background:#20222a;color:#cfd0d8;border:1px solid #303139;border-radius:10px;width:34px;height:34px;font-size:14px;cursor:pointer}',
    '.pb-rs{display:grid;place-items:center;color:#f5b942;background:#2a2314;border-color:#4a3b17}',
'.pb-rs[hidden]{display:none}',
'.pb-rs.armed{background:#f5b942;color:#1a1405;border-color:#f5b942}',
'.pb-rs:disabled{opacity:.4}',
'.pb-grid{display:grid;grid-template-columns:1.6fr 1fr;gap:10px}',
    '.pb-f{display:flex;flex-direction:column;gap:5px;min-width:0;margin-top:10px}',
    '.pb-grid .pb-f{margin-top:0}',
    '.pb-f label{font-size:10px;font-weight:800;letter-spacing:1px;color:var(--muted);text-transform:uppercase}',
    '.pb-f input{width:100%;min-width:0;box-sizing:border-box;background:#101115;color:var(--text);border:1px solid var(--line);border-radius:10px;padding:11px 12px;font-size:13px;outline:0;font-family:inherit}',
    '.pb-f input:focus{border-color:var(--red)}',
    '.pb-mini{margin-top:10px;background:#20222a;color:#cfd0d8;border:1px solid #303139;border-radius:8px;padding:8px 12px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;transition:transform .14s ease}',
    '.pb-mini:active,.pb-go:active{transform:scale(.97)}',
    '.pb-new{margin-top:14px;padding-top:12px;border-top:1px solid #25262c}',
    '.pb-nt{font-size:12px;font-weight:800;margin-bottom:8px}',
    '.pb-f select{width:100%;box-sizing:border-box;background:#101115;color:var(--text);border:1px solid var(--line);border-radius:10px;padding:11px 12px;font-size:13px;font-family:inherit}',
    '.pb-new .pb-go{background:#2f3a52}',
    '.pb-note{font-size:12px;color:var(--muted);line-height:1.5;margin-top:10px}',
    '.pb-note.bad{color:#ff8a8a}.pb-note.ok{color:#3ddc84}.pb-note.warn{color:#f5b942}',
    '.pb-list{margin-top:10px;max-height:34vh;overflow-y:auto;border:1px solid #25262c;border-radius:12px;background:#101115}',
    '.pb-list:empty{display:none}',
    '.pb-row{display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid #1f2026;font-size:12px;cursor:pointer}',
    '.pb-row:last-child{border-bottom:0}',
    '.pb-row input{flex-shrink:0;width:16px;height:16px;accent-color:#ff2d46}',
    '.pb-path{flex:1;min-width:0;overflow-wrap:anywhere;font-weight:600}',
    '.pb-tag{flex-shrink:0;font-size:9px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;border-radius:999px;padding:3px 8px}',
    '.pb-tag.new{background:#16331f;color:#3ddc84}.pb-tag.mod{background:#2f3a52;color:#cfe0ff}.pb-tag.warn{background:#3a2d12;color:#f5b942}',
    '.pb-tag.del{background:#3a1218;color:#ff6b81}',
'.pb-status{font-size:12px;color:#cfe0ff;min-height:16px;margin-top:10px}',
    '.pb-go{display:block;width:100%;margin-top:10px;padding:13px;border:0;border-radius:12px;background:var(--red);color:#fff;font-size:14px;font-weight:800;cursor:pointer;font-family:inherit;transition:transform .14s ease,opacity .14s ease}',
    '.pb-go:disabled{opacity:.4;cursor:not-allowed}',
    '.pb-done{text-align:center;padding:10px 0}',
    '.pb-check{width:48px;height:48px;border-radius:50%;background:#16331f;color:#3ddc84;display:grid;place-items:center;font-size:24px;margin:0 auto 10px}',
    '.pb-link{display:inline-block;margin:12px 0 4px;color:#cfe0ff;font-size:13px;font-weight:700;text-decoration:none}'
  ].join('\n');
  document.head.appendChild(st);
}
function addBtn(){
  var row=document.querySelector('.et-file-row');if(!row||$('editorPublishBtn'))return;
  var b=document.createElement('button');b.id='editorPublishBtn';b.className='editor-btn small';
  b.title='Publish to GitHub';b.setAttribute('aria-label','Publish to GitHub');
  b.innerHTML='<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4"/><path d="M7 9l5-5 5 5"/><path d="M4 20h16"/></svg>';
  b.onclick=openSheet;
  var theme=$('editorThemeBtn');
  if(theme&&theme.nextSibling)row.insertBefore(b,theme.nextSibling);else row.appendChild(b);
}
injectCss();addBtn();
window.__pb={sha1blob:sha1blob,b64:b64,computeScan:computeScan,pushRows:pushRows};
})();
