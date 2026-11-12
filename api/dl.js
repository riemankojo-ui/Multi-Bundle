export const config = { runtime: 'edge' };

export default async function handler(req) {
  const u = new URL(req.url);
  const repo = u.searchParams.get('repo') || '';
  const tag = u.searchParams.get('tag') || '';
  const name = u.searchParams.get('name') || '';
  const asset = u.searchParams.get('asset') || '';
  const gh = req.headers.get('x-gh');
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return new Response('bad request', { status: 400 });
  const H = function (a) { return { Authorization: 'Bearer ' + gh, Accept: a, 'User-Agent': 'multibundle' }; };
  let r;
  if (asset && gh && /^\d+$/.test(asset)) {
    r = await fetch('https://api.github.com/repos/' + repo + '/releases/assets/' + asset, { headers: H('application/octet-stream'), redirect: 'follow' });
  } else {
    if (!/^[\w.-]+$/.test(tag) || !/^[\w.-]+$/.test(name)) return new Response('bad request', { status: 400 });
    if (gh) {
      const meta = await (await fetch('https://api.github.com/repos/' + repo + '/releases/tags/' + tag, { headers: H('application/vnd.github+json') })).json();
      const as = (meta.assets || []).find(function (x) { return x.name === name; });
      if (!as) return new Response('asset not found', { status: 404 });
      r = await fetch('https://api.github.com/repos/' + repo + '/releases/assets/' + as.id, { headers: H('application/octet-stream'), redirect: 'follow' });
    } else {
      r = await fetch('https://github.com/' + repo + '/releases/download/' + tag + '/' + name, { redirect: 'follow' });
    }
  }
  return new Response(r.body, {
    status: r.status,
    headers: { 'content-type': 'application/octet-stream', 'cache-control': 'no-store' }
  });
}