import pg from 'pg';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
const e = process.env;
export const pool = new pg.Pool({ connectionString: e.DATABASE_URL, max: 5 });
export const q = (s, p) => pool.query(s, p).then(r => r.rows);
export async function migrate() {
  await pool.query('create table if not exists _migrations(name text primary key)');
  for (const f of fs.readdirSync('database').filter(f => f.endsWith('.sql')).sort()) {
    if ((await q('select 1 from _migrations where name=$1', [f])).length) continue;
    const c = await pool.connect();
    try { await c.query('begin'); await c.query(fs.readFileSync(path.join('database', f), 'utf8')); await c.query('insert into _migrations values($1)', [f]); await c.query('commit'); console.log('applied', f); }
    catch (x) { await c.query('rollback'); throw x; } finally { c.release(); }
  }
}
const key = crypto.createHash('sha256').update(e.SESSION_SECRET || '').digest();
export const enc = t => { const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', key, iv); const d = Buffer.concat([c.update(t, 'utf8'), c.final()]); return Buffer.concat([iv, c.getAuthTag(), d]).toString('base64'); };
export const dec = s => { const b = Buffer.from(s, 'base64'), d = crypto.createDecipheriv('aes-256-gcm', key, b.subarray(0, 12)); d.setAuthTag(b.subarray(12, 28)); return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8'); };
export const setting = async k => (await q('select value from settings where key=$1', [k]))[0]?.value;

const r2 = e.R2_ACCOUNT_ID && e.R2_ACCESS_KEY_ID && e.R2_SECRET_ACCESS_KEY && e.R2_BUCKET_NAME;
const s3 = r2 && new S3Client({ region: 'auto', endpoint: e.R2_ENDPOINT || `https://${e.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, credentials: { accessKeyId: e.R2_ACCESS_KEY_ID, secretAccessKey: e.R2_SECRET_ACCESS_KEY } });
const B = e.R2_BUCKET_NAME, local = k => path.join('tmp-uploads', k.replace(/[^\w.-]/g, '_'));
export const storage = {
  mode: r2 ? 'r2' : 'local', local,
  upload: async (k, body, size) => {
    if (r2) return s3.send(new PutObjectCommand({ Bucket: B, Key: k, Body: body, ContentLength: size, ContentType: 'video/mp4' }));
    fs.mkdirSync('tmp-uploads', { recursive: true });
    return pipeline(body, fs.createWriteStream(local(k)));
  },
  size: async k => r2 ? (await s3.send(new HeadObjectCommand({ Bucket: B, Key: k }))).ContentLength : fs.statSync(local(k)).size,
  url: async k => r2 ? getSignedUrl(s3, new GetObjectCommand({ Bucket: B, Key: k }), { expiresIn: 3600 }) : `${e.APP_URL}/api/media/${encodeURIComponent(k)}`,
  del: async k => { if (r2) await s3.send(new DeleteObjectCommand({ Bucket: B, Key: k })); else fs.rmSync(local(k), { force: true }); }
};

const V = e.META_GRAPH_API_VERSION || 'v21.0', GH = 'https://graph.instagram.com';
async function j(r) {
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.error || d.error_message) {
    const er = new Error(d.error?.message || d.error_message || `Instagram API error ${r.status}`);
    er.auth = d.error?.code === 190; er.permanent = er.auth || [10, 200, 100].includes(d.error?.code);
    throw er;
  }
  return d;
}
export const IG = {
  authUrl: s => 'https://www.instagram.com/oauth/authorize?' + new URLSearchParams({ client_id: e.META_APP_ID, redirect_uri: e.META_REDIRECT_URI, response_type: 'code', scope: e.META_SCOPES || 'instagram_business_basic,instagram_business_content_publish', state: s }),
  async connect(code) {
    const s = await j(await fetch('https://api.instagram.com/oauth/access_token', { method: 'POST', body: new URLSearchParams({ client_id: e.META_APP_ID, client_secret: e.META_APP_SECRET, grant_type: 'authorization_code', redirect_uri: e.META_REDIRECT_URI, code: code.replace(/#_$/, '') }) }));
    const l = await j(await fetch(`${GH}/access_token?` + new URLSearchParams({ grant_type: 'ig_exchange_token', client_secret: e.META_APP_SECRET, access_token: s.access_token })));
    const me = await j(await fetch(`${GH}/${V}/me?` + new URLSearchParams({ fields: 'user_id,username,profile_picture_url', access_token: l.access_token })));
    return { token: l.access_token, expires: new Date(Date.now() + l.expires_in * 1000), id: String(me.user_id || s.user_id), username: me.username, picture: me.profile_picture_url };
  },
  post: async (p, tok, body) => j(await fetch(`${GH}/${V}/${p}`, { method: 'POST', body: new URLSearchParams({ ...body, access_token: tok }) })),
  get: async (p, tok, qs) => j(await fetch(`${GH}/${V}/${p}?` + new URLSearchParams({ ...qs, access_token: tok })))
};
