import { boundary, identity, db, bucket, json, permit, HttpError } from '@/lib/server';
export const dynamic='force-dynamic';
export async function GET(req:Request){return boundary(req,async()=>{
 const u=await identity(req);permit(u,'manage');const since=new Date(Date.now()-24*3600000).toISOString();
 const [stats,requests,deliveries,events]=await Promise.all([
  db().prepare('SELECT COUNT(*) AS total,COALESCE(SUM(CASE WHEN status >= 500 THEN 1 ELSE 0 END),0) AS failures,COALESCE(SUM(CASE WHEN status >= 400 AND status < 500 THEN 1 ELSE 0 END),0) AS rejected,COALESCE(AVG(duration_ms),0) AS averageMs,COALESCE(MAX(duration_ms),0) AS maximumMs FROM requests WHERE workspace_id = ? AND created_at >= ?').bind(u.workspaceId,since).first(),
  db().prepare('SELECT * FROM requests WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 100').bind(u.workspaceId).all(),
  db().prepare("SELECT id,status,last_error,updated_at FROM deliveries WHERE workspace_id = ? AND status IN ('failed','uncertain','sending') ORDER BY updated_at DESC LIMIT 50").bind(u.workspaceId).all(),
  db().prepare('SELECT id,actor,action,evidence,created_at FROM workspace_events WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 100').bind(u.workspaceId).all(),
 ]);
 let objectStorage='unavailable';try{await bucket().list({prefix:'health/'+u.workspaceId+'/',limit:1});objectStorage='reachable';}catch{}
 return json({stats,requests:requests.results,incidents:deliveries.results,events:events.results,health:{database:'reachable',objectStorage},windowHours:24});
});}
