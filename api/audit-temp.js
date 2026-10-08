const crypto = require('node:crypto');

const AUTH_HASH = '49e16394a90930b07efebc71939a74406a38fe73bc507a4a758d879469577e8f';

function json(res,status,body){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(body));}
function authorized(req){const key=String(req.headers['x-analytics-key']||'');const got=crypto.createHash('sha256').update(key).digest();const want=Buffer.from(AUTH_HASH,'hex');return got.length===want.length&&crypto.timingSafeEqual(got,want);}
function auth(){if(process.env.BLOB_READ_WRITE_TOKEN)return{token:process.env.BLOB_READ_WRITE_TOKEN};if(process.env.VERCEL_OIDC_TOKEN&&process.env.BLOB_STORE_ID)return{oidcToken:process.env.VERCEL_OIDC_TOKEN,storeId:process.env.BLOB_STORE_ID};return null;}
async function listAll(prefix,a){const {list}=await import('@vercel/blob');let cursor;const out=[];do{const p=await list({prefix,cursor,limit:1000,...a});out.push(...(p.blobs||[]));cursor=p.hasMore?p.cursor:undefined;}while(cursor);return out;}
async function read(path,a){const {get}=await import('@vercel/blob');const r=await get(path,{access:'private',useCache:false,...a});if(!r||r.statusCode!==200)return null;try{return JSON.parse(await new Response(r.stream).text());}catch(_){return null;}}
function inc(o,k){k=k||'(none)';o[k]=(o[k]||0)+1;}

module.exports=async function(req,res){
 if(req.method!=='GET'){res.setHeader('Allow','GET');return json(res,405,{error:'Method not allowed'});}
 if(!authorized(req))return json(res,401,{error:'Unauthorized'});
 const a=auth(); if(!a)return json(res,503,{error:'Storage unavailable'});
 const campaign=String(req.query&&req.query.campaign||'');
 const since=new Date(String(req.query&&req.query.since||'2026-10-08T08:11:00Z'));
 const until=new Date(String(req.query&&req.query.until||new Date().toISOString()));
 const days=[...new Set([since.toISOString().slice(0,10),until.toISOString().slice(0,10)])];
 const sources=new Set(['assistant-smoke-test','assistant-funnel-test']);
 const land=[], funnel=[];
 for(const day of days){
   for(const b of await listAll('analytics/landing-views/'+day+'/',a)){const e=await read(b.pathname,a);if(!e)continue;const t=new Date(e.occurredAt);if(t<since||t>until||sources.has(e.utmSource))continue;if(campaign&&e.utmCampaign!==campaign)continue;land.push(e);}
   for(const b of await listAll('analytics/funnel/'+day+'/',a)){const e=await read(b.pathname,a);if(!e)continue;const t=new Date(e.occurredAt);if(t<since||t>until||sources.has(e.utmSource))continue;if(campaign&&e.utmCampaign!==campaign)continue;funnel.push(e);}
 }
 const bySource={}, byRef={}, hourly={}, funnelCounts={};
 for(const e of land){inc(bySource,e.utmSource);inc(byRef,e.referrerHost);inc(hourly,String(e.occurredAt).slice(0,13)+':00Z');}
 for(const e of funnel){inc(funnelCounts,e.event);}
 return json(res,200,{since:since.toISOString(),until:until.toISOString(),campaign,landingViews:land.length,bySource,byRef,hourly,funnelCounts,funnelEvents:funnel.map(e=>({event:e.event,occurredAt:e.occurredAt,utmSource:e.utmSource,details:e.details||{}}))});
};