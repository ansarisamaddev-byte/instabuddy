import { q, dec, IG, storage, setting } from './lib.js';
import { canPublish } from './policy.js';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let running = false;
async function publish(p) {
  const [a] = await q('select * from ig_accounts where id=$1', [p.account_id]);
  const [v] = await q('select * from videos where id=$1', [p.video_id]);
  const tok = dec(a.token_enc); let c = p.container;
  if (!c) { // container id persisted so a retry never creates a second container
    c = (await IG.post(`${a.ig_user_id}/media`, tok, { media_type: 'REELS', video_url: await storage.url(v.key), caption: p.caption || '' })).id;
    await q('update posts set container=$1 where id=$2', [c, p.id]);
  }
  for (let i = 0; ; i++) {
    const s = (await IG.get(c, tok, { fields: 'status_code' })).status_code;
    if (s === 'FINISHED') break;
    if (s === 'ERROR' || s === 'EXPIRED') { const er = new Error('Instagram could not process the video (' + s + ')'); er.permanent = true; throw er; }
    if (i >= 30) throw new Error('Instagram is still processing the video');
    await sleep(5000);
  }
  return (await IG.post(`${a.ig_user_id}/media_publish`, tok, { creation_id: c })).id;
}
async function run(p) {
  try {
    const [u] = await q('select * from users where id=$1', [p.user_id]);
    const [plan] = await q('select * from plans where id=$1', [u.plan_id]);
    const [a] = await q('select * from ig_accounts where id=$1', [p.account_id]);
    const why = canPublish(u, plan, (await setting('paused')) === 'true') || (!a.enabled && 'Instagram account is disabled') || (a.status !== 'CONNECTED' && 'Instagram account needs reconnecting');
    if (why) return q("update posts set status='BLOCKED',error=$2,updated_at=now() where id=$1", [p.id, why]);
    const mediaId = await publish(p);
    await q("update posts set status='PUBLISHED',media_id=$2,error=null,updated_at=now() where id=$1", [p.id, mediaId]);
  } catch (x) {
    if (x.auth) await q("update ig_accounts set status='REAUTH_REQUIRED',last_error=$2 where id=$1", [p.account_id, x.message]);
    const final = x.permanent || p.attempts >= 3;
    await q('update posts set status=$2,error=$3,next_try=now()+($4||\' minutes\')::interval,updated_at=now() where id=$1', [p.id, final ? 'FAILED' : 'SCHEDULED', x.message, String(p.attempts * 5)]);
  }
}
export async function tick() {
  if (running) return { skipped: true }; running = true;
  try {
    await q("update posts set status='SCHEDULED',updated_at=now() where status='PROCESSING' and updated_at<now()-interval '10 minutes'"); // restart recovery
    const jobs = await q(`update posts set status='PROCESSING',attempts=attempts+1,updated_at=now() where id in (
      select id from posts where status='SCHEDULED' and run_at<=now() and (next_try is null or next_try<=now()) order by run_at limit 3 for update skip locked) returning *`);
    await Promise.all(jobs.map(run));
    const days = Number(await setting('retention_days')) || 1;
    const old = await q(`select v.* from videos v where v.status<>'DELETED' and not exists(select 1 from posts p where p.video_id=v.id and p.status in('SCHEDULED','PROCESSING'))
      and greatest(v.created_at,(select coalesce(max(updated_at),'epoch') from posts p where p.video_id=v.id))<now()-($1||' days')::interval limit 20`, [String(days)]);
    for (const v of old) try { await storage.del(v.key); await q("update videos set status='DELETED' where id=$1", [v.id]); } catch (x) { console.error('cleanup failed', v.id, x.message); }
    return { processed: jobs.length, cleaned: old.length };
  } finally { running = false; }
}
