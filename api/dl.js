export const config = { runtime: 'edge' };

export default async function handler(req) {
  const u = new URL(req.url);
  const repo = u.searchParams.get('repo') || '';
  const tag = u.searchParams.get('tag') || '';
  const name = u.searchParams.get('name') || '';
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || !/^[\w.-]+$/.test(tag) || !/^[\w.-]+\.apk$/.test(name)) {
    return new Response('bad request', { status: 400 });
  }
  const headers = {};
  const gh = req.headers.get('x-gh');
  if (gh) headers.Authorization = 'Bearer ' + gh;
  const r = await fetch('https://github.com/' + repo + '/releases/download/' + tag + '/' + name, { headers, redirect: 'follow' });
  return new Response(r.body, {
    status: r.status,
    headers: { 'content-type': 'application/octet-stream', 'cache-control': 'no-store' }
  });
}