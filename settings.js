/* Multi Bundle - Settings tab (deploy + domains). Saved per project on this device. */
(function(){
'use strict';
var $=function(id){return document.getElementById(id)};
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function toast(m,t){if(window.showToast)window.showToast(m,t)}

var PROVIDERS={
  vercel:{name:'Vercel',dash:'https://vercel.com/dashboard',
    cmd:function(){return 'vercel --prod'},
    hint:'Connect your GitHub repo once. After that, every push to your production branch deploys by itself.',
    dns:'Open your project in Vercel and find the Domains section. It shows the exact DNS records to add at your domain registrar.'},
  netlify:{name:'Netlify',dash:'https://app.netlify.com',
    cmd:function(s){return 'netlify deploy --prod --dir='+(s.dir||'.')},
    hint:'Link the repo in Netlify and set the publish folder. Pushes to your production branch deploy by themselves.',
    dns:'Open your site in Netlify and find Domain management. Add the domain and follow the DNS records it shows.'},
  github:{name:'GitHub Pages',dash:'https://github.com',
    cmd:function(s){return 'git push origin '+(s.branch||'main')},
    hint:'Pages publishes the branch and folder chosen in the repo settings. Each push updates the live site.',
    dns:'Open the repo settings and find Pages, then set your custom domain. Add the DNS records GitHub lists.'},
  cloudflare:{name:'Cloudflare Pages',dash:'https://dash.cloudflare.com',
    cmd:function(s){return 'wrangler pages deploy '+(s.dir||'.')+' --project-name='+(s.name||'my-site')},
    hint:'Connect the repo in Pages and set the build output folder. Each push to your production branch deploys.',
    dns:'Open your Pages project in Cloudflare and find Custom domains. Add the domain and follow the steps shown.'}
};

function defaults(){return {provider:'vercel',name:'',repo:'',branch:'main',dir:'.',auto:true,url:'',domains:[]}}
function key(){var id=(typeof currentProjectId!=='undefined'&&currentProjectId)?currentProjectId:'global';return 'mb_deploy_'+id}
function load(){
  var s=defaults();
  try{var o=JSON.parse(localStorage.getItem(key())||'null');if(o&&typeof o==='object'){for(var k in o)s[k]=o[k]}}catch(e){}
  if(!Array.isArray(s.domains))s.domains=[];
  return s;
}
function save(s){try{localStorage.setItem(key(),JSON.stringify(s))}catch(e){}}
function fullUrl(u){u=(u||'').trim();if(!u)return '';return /^https?:\/\//i.test(u)?u:'https://'+u}
function go(u){if(u)window.open(u,'_blank','noopener')}
function isRepo(r){return /^[\w.-]+\/[\w.-]+$/.test(r||'')}
function dashUrl(s){var P=PROVIDERS[s.provider]||PROVIDERS.vercel;if(s.provider==='github'&&isRepo(s.repo))return 'https://github.com/'+s.repo+'/settings/pages';return P.dash}
function cleanDomain(v){return (v||'').trim().toLowerCase().replace(/^https?:\/\//,'').replace(/\/.*$/,'').replace(/^\.+|\.+$/g,'')}
function askConfirm(msg,title,yes){
  if(typeof window.showConfirm==='function')return window.showConfirm(msg,{title:title,confirmText:yes,cancelText:'Cancel'});
  return Promise.resolve(window.confirm(msg));
}
function copyText(t){
  function fb(){var a=document.createElement('textarea');a.value=t;a.style.cssText='position:fixed;opacity:0';document.body.appendChild(a);a.select();try{document.execCommand('copy')}catch(e){}document.body.removeChild(a)}
  try{
    if(navigator.clipboard&&window.isSecureContext){
      navigator.clipboard.writeText(t).then(function(){toast('Copied','success')},function(){fb();toast('Copied','success')});
      return;
    }
  }catch(e){}
  fb();toast('Copied','success');
}
function checkDomain(d,dot){
  if(dot)dot.className='st-dot wait';
  var ctl=new AbortController();var timer=setTimeout(function(){ctl.abort()},7000);
  return fetch('https://'+d,{mode:'no-cors',cache:'no-store',signal:ctl.signal}).then(function(){
    clearTimeout(timer);if(dot)dot.className='st-dot ok';return true;
  }).catch(function(){
    clearTimeout(timer);if(dot)dot.className='st-dot bad';return false;
  });
}

function domRow(d,i){
  return '<div class="st-dom" data-i="'+i+'">'+
    '<div class="st-dom-top"><span class="st-dot"></span><span class="st-dom-name">'+esc(d.d)+'</span>'+(d.primary?'<span class="st-badge">Primary</span>':'')+'</div>'+
    '<div class="st-dom-btns">'+
      '<button class="st-mini" data-a="check">Check</button>'+
      '<button class="st-mini" data-a="open">Open</button>'+
      '<button class="st-mini" data-a="copy">Copy</button>'+
      (d.primary?'':'<button class="st-mini" data-a="primary">Make primary</button>')+
      '<button class="st-mini del" data-a="del">Remove</button>'+
    '</div></div>';
}

function linksHtml(s){
  var site=fullUrl(s.url);
  var list=[
    {l:'Open live site',u:site},
    {l:(PROVIDERS[s.provider]||PROVIDERS.vercel).name+' dashboard',u:dashUrl(s)},
    {l:'GitHub repository',u:isRepo(s.repo)?'https://github.com/'+s.repo:''},
    {l:'Test speed (PageSpeed Insights)',u:site?'https://pagespeed.web.dev/analysis?url='+encodeURIComponent(site):''},
    {l:'Google Search Console',u:'https://search.google.com/search-console'}
  ].filter(function(x){return x.u});
  return '<div class="st-head"><div><label class="eyebrow">SHORTCUTS</label><h2>Quick links</h2></div></div>'+
    list.map(function(x){return '<a class="st-link" href="'+esc(x.u)+'" target="_blank" rel="noopener"><span>'+esc(x.l)+'</span><span>\u2197</span></a>'}).join('');
}

function render(){
  var root=$('settingsRoot');if(!root)return;
  var s=load(),P=PROVIDERS[s.provider]||PROVIDERS.vercel;
  var proj=window.__currentProjectName||'No project loaded';
  var chips=Object.keys(PROVIDERS).map(function(k){
    return '<button class="st-chip'+(k===s.provider?' on':'')+'" data-p="'+k+'">'+PROVIDERS[k].name+'</button>';
  }).join('');
  var doms=s.domains.length?s.domains.map(domRow).join(''):'<div class="st-empty">No domains yet. Add your first one above.</div>';

  root.innerHTML=
  '<section class="card hero"><label class="eyebrow">SETTINGS</label><h1>Deploy <span>&amp; Domains</span></h1>'+
    '<p>Keep your hosting details, domains and shortcuts in one place. Saved on this device for each project.</p>'+
    '<span class="pill">'+esc(proj)+'</span></section>'+

  '<section class="card"><div class="st-head"><div><label class="eyebrow">DEPLOYMENT</label><h2>Hosting</h2></div><span class="pill">'+esc(P.name)+'</span></div>'+
    '<div class="st-chips">'+chips+'</div>'+
    '<div class="st-grid">'+
      '<div class="st-field"><label>Site name</label><input id="stName" placeholder="flextune" value="'+esc(s.name)+'" autocomplete="off"></div>'+
      '<div class="st-field"><label>GitHub repo</label><input id="stRepo" placeholder="owner/repo" value="'+esc(s.repo)+'" autocomplete="off" autocapitalize="off"></div>'+
      '<div class="st-field"><label>Branch</label><input id="stBranch" placeholder="main" value="'+esc(s.branch)+'" autocomplete="off" autocapitalize="off"></div>'+
      '<div class="st-field"><label>Publish folder</label><input id="stDir" placeholder="." value="'+esc(s.dir)+'" autocomplete="off" autocapitalize="off"></div>'+
      '<div class="st-field full"><label>Live URL</label><input id="stUrl" placeholder="https://yoursite.com" value="'+esc(s.url)+'" autocomplete="off" autocapitalize="off"></div>'+
    '</div>'+
    '<div class="st-row"><div><b>Auto-deploy on push</b><small>A reminder of how this site is set up</small></div><label class="st-switch"><input type="checkbox" id="stAuto"'+(s.auto?' checked':'')+'><span></span></label></div>'+
    '<div class="st-hint" id="stHint">'+esc(P.hint)+'</div>'+
    '<div class="st-code"><code id="stCmd">'+esc(P.cmd(s))+'</code><button class="st-mini" id="stCopyCmd">Copy</button></div>'+
    '<div class="st-actions"><button class="btn primary" id="stSave">Save</button><button class="btn secondary" id="stOpenSite">Open live site</button><button class="btn secondary" id="stOpenDash">Open dashboard</button></div>'+
  '</section>'+

  '<section class="card"><div class="st-head"><div><label class="eyebrow">DOMAINS</label><h2>Custom domains</h2></div><span class="pill">'+s.domains.length+'</span></div>'+
    '<div class="st-add"><input id="stDomIn" placeholder="example.com" autocomplete="off" autocapitalize="off"><button class="btn primary" id="stDomAdd">Add</button></div>'+
    '<div id="stDomList">'+doms+'</div>'+
    (s.domains.length>1?'<div class="st-actions"><button class="st-mini" id="stCheckAll">Check all domains</button></div>':'')+
    '<div class="st-dns"><b>Connect a domain.</b> Use an A record for the main domain (example.com) and a CNAME record for www. '+esc(P.dns)+' Copy the exact values from there, because they can differ for each project.'+
    '<div class="st-actions"><button class="st-mini" id="stOpenDns">Open '+esc(P.name)+'</button></div></div>'+
  '</section>'+

  '<section class="card" id="stLinks">'+linksHtml(s)+'</section>'+

  '<section class="card"><div class="st-row" style="padding-top:0"><div><b>Reset this project\u2019s settings</b><small>Clears the hosting details and domain list</small></div><button class="st-mini del" id="stReset">Reset</button></div></section>';

  bind(s);
}

function bind(s){
  var root=$('settingsRoot');
  root.querySelectorAll('[data-p]').forEach(function(b){
    b.onclick=function(){s.provider=b.dataset.p;save(s);render()};
  });
  [['stName','name'],['stRepo','repo'],['stBranch','branch'],['stDir','dir'],['stUrl','url']].forEach(function(f){
    var el=$(f[0]);if(!el)return;
    el.oninput=function(){
      s[f[1]]=el.value.trim();save(s);
      var c=$('stCmd');if(c)c.textContent=(PROVIDERS[s.provider]||PROVIDERS.vercel).cmd(s);
      var l=$('stLinks');if(l)l.innerHTML=linksHtml(s);
    };
  });
  $('stAuto').onchange=function(){s.auto=this.checked;save(s)};
  $('stCopyCmd').onclick=function(){copyText($('stCmd').textContent)};
  $('stSave').onclick=function(){save(s);toast('Settings saved','success')};
  $('stOpenSite').onclick=function(){var u=fullUrl(s.url);if(!u){toast('Add your live URL first','error');return}go(u)};
  $('stOpenDash').onclick=function(){go(dashUrl(s))};
  $('stOpenDns').onclick=function(){go(dashUrl(s))};

  function addDomain(){
    var inp=$('stDomIn');var d=cleanDomain(inp.value);
    if(!/^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(d)){toast('Enter a domain like example.com','error');return}
    if(s.domains.some(function(x){return x.d===d})){toast('That domain is already in the list','error');return}
    s.domains.push({d:d,primary:!s.domains.length});
    if(!s.url)s.url='https://'+d;
    save(s);render();toast('Added '+d,'success');
  }
  $('stDomAdd').onclick=addDomain;
  $('stDomIn').addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();addDomain()}});

  $('stDomList').onclick=function(e){
    var b=e.target.closest('button[data-a]');if(!b)return;
    var row=b.closest('.st-dom');var i=parseInt(row.dataset.i,10);var d=s.domains[i];if(!d)return;
    var a=b.dataset.a;
    if(a==='open')go('https://'+d.d);
    else if(a==='copy')copyText(d.d);
    else if(a==='check'){checkDomain(d.d,row.querySelector('.st-dot')).then(function(ok){toast(ok?d.d+' is reachable':d.d+' is not reachable yet',ok?'success':'error')})}
    else if(a==='primary'){s.domains.forEach(function(x){x.primary=false});d.primary=true;s.url='https://'+d.d;save(s);render()}
    else if(a==='del'){
      askConfirm('Remove '+d.d+' from this list?','Remove domain','Remove').then(function(ok){
        if(!ok)return;
        s.domains.splice(i,1);
        if(s.domains.length&&!s.domains.some(function(x){return x.primary}))s.domains[0].primary=true;
        save(s);render();
      });
    }
  };
  var all=$('stCheckAll');
  if(all)all.onclick=function(){
    var rows=Array.prototype.slice.call(root.querySelectorAll('.st-dom'));
    rows.reduce(function(p,row){
      return p.then(function(){var d=s.domains[parseInt(row.dataset.i,10)];return d?checkDomain(d.d,row.querySelector('.st-dot')):null});
    },Promise.resolve()).then(function(){toast('Check finished')});
  };
  $('stReset').onclick=function(){
    askConfirm('Clear the hosting details and domain list for this project?','Reset settings','Reset').then(function(ok){
      if(!ok)return;
      try{localStorage.removeItem(key())}catch(e){}
      render();toast('Settings reset');
    });
  };
}

function injectCss(){
  if($('stStyle'))return;
  var st=document.createElement('style');st.id='stStyle';
  st.textContent=[
    '#settingsRoot{display:flex;flex-direction:column;gap:12px}',
    '#settingsRoot .st-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:6px}',
    '#settingsRoot .st-head h2{margin:2px 0 0;font-size:17px}',
    '.st-chips{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0 14px}',
    '.st-chip{padding:8px 13px;border-radius:999px;border:1px solid #303139;background:#1a1b20;color:#cfd0d8;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;transition:transform .14s ease,background .14s ease}',
    '.st-chip.on{background:#2f3a52;color:#cfe0ff;border-color:#3c4a68}',
    '.st-chip:active,.st-mini:active{transform:scale(.96)}',
    '.st-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}',
    '.st-field{display:flex;flex-direction:column;gap:5px;min-width:0}',
    '.st-field.full{grid-column:1/-1}',
    '.st-field label{font-size:10px;font-weight:800;letter-spacing:1px;color:var(--muted);text-transform:uppercase}',
    '.st-field input,.st-add input{width:100%;min-width:0;box-sizing:border-box;background:#101115;color:var(--text);border:1px solid var(--line);border-radius:10px;padding:11px 12px;font-size:13px;outline:0;font-family:inherit}',
    '.st-field input:focus,.st-add input:focus{border-color:var(--red)}',
    '.st-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 2px 4px}',
    '.st-row b{font-size:13px}',
    '.st-row small{display:block;color:var(--muted);font-size:11px;margin-top:2px}',
    '.st-switch{position:relative;width:44px;height:26px;flex-shrink:0}',
    '.st-switch input{opacity:0;width:100%;height:100%;position:absolute;margin:0;cursor:pointer;z-index:1}',
    '.st-switch span{position:absolute;inset:0;background:#2a2c34;border-radius:999px;transition:background .18s}',
    '.st-switch span::after{content:"";position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;transition:transform .18s}',
    '.st-switch input:checked+span{background:var(--red)}',
    '.st-switch input:checked+span::after{transform:translateX(18px)}',
    '.st-hint{font-size:12px;color:var(--muted);line-height:1.5;margin:10px 0}',
    '.st-code{display:flex;align-items:center;gap:8px;background:#0d0e12;border:1px solid #23242a;border-radius:10px;padding:8px 8px 8px 12px}',
    '.st-code code{flex:1;min-width:0;overflow-x:auto;white-space:nowrap;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;color:#e6e6e8}',
    '.st-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}',
    '.st-mini{background:#20222a;color:#cfd0d8;border:1px solid #303139;border-radius:8px;padding:7px 10px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;transition:transform .14s ease,opacity .14s ease}',
    '.st-mini.del{color:#ff8a8a}',
    '.st-add{display:flex;gap:8px;margin:10px 0 12px}',
    '.st-dom{background:#15161a;border:1px solid #25262c;border-radius:12px;padding:11px 12px;margin-bottom:8px}',
    '.st-dom-top{display:flex;align-items:center;gap:8px;min-width:0}',
    '.st-dom-name{font-size:14px;font-weight:700;overflow-wrap:anywhere;min-width:0}',
    '.st-badge{font-size:9px;font-weight:800;letter-spacing:1px;text-transform:uppercase;background:#2f3a52;color:#cfe0ff;border-radius:999px;padding:3px 8px;flex-shrink:0}',
    '.st-dot{width:9px;height:9px;border-radius:50%;background:#4a4b55;flex-shrink:0}',
    '.st-dot.ok{background:#3ddc84}',
    '.st-dot.bad{background:#ff5d6c}',
    '.st-dot.wait{background:#f5b942;border-radius:2px;animation:mb-spin 1s linear infinite}',
    '.st-dom-btns{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}',
    '.st-empty{color:var(--muted);font-size:12px;text-align:center;padding:16px 0}',
    '.st-dns{font-size:12px;color:var(--muted);line-height:1.55;margin-top:12px;padding:12px;border-radius:10px;background:#101115;border:1px solid #1f2026}',
    '.st-dns b{color:var(--text)}',
    '.st-link{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:13px 4px;border-bottom:1px solid #1f2026;color:var(--text);text-decoration:none;font-size:13px;font-weight:600}',
    '.st-link:last-child{border-bottom:0}',
    '.st-link span:last-child{color:var(--muted)}',
    '.st-link:active{opacity:.7}'
  ].join('\n');
  document.head.appendChild(st);
}

injectCss();

var origShow=window.showTab;
window.showTab=function(name){
  if(typeof origShow==='function')origShow(name);
  var sp=$('settingsPage');if(sp)sp.hidden=(name!=='settings');
  if(name==='settings')render();
};
document.addEventListener('click',function(e){
  var el=e.target.closest&&e.target.closest('[data-tab]');if(!el)return;
  var name=el.dataset.tab;var sp=$('settingsPage');if(!sp)return;
  if(name==='settings')window.showTab('settings');else sp.hidden=true;
},true);

try{var nav=JSON.parse(localStorage.getItem('mb_nav')||'null');if(nav&&nav.tab==='settings')window.showTab('settings')}catch(e){}
})();
