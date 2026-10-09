const crypto = require('node:crypto');

const AUTH_HASH = '0f0d6789f329291295e08258e83824716ad257d1a0fb13f0b5665051e1a2b0f4';

function json(res,status,body){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(body));}
function authorized(req){const key=String(req.headers['x-audit-key']||'');const got=crypto.createHash('sha256').update(key).digest();const want=Buffer.from(AUTH_HASH,'hex');return got.length===want.length&&crypto.timingSafeEqual(got,want);}
function auth(){if(process.env.BLOB_READ_WRITE_TOKEN)return{token:process.env.BLOB_READ_WRITE_TOKEN};if(process.env.VERCEL_OIDC_TOKEN&&process.env.BLOB_STORE_ID)return{oidcToken:process.env.VERCEL_OIDC_TOKEN,storeId:process.env.BLOB_STORE_ID};return null;}
async function listAll(prefix,a){const {list}=await import('@vercel/blob');const out=[];let cursor;do{const p=await list({prefix,cursor,limit:1000,...a});out.push(...(p.blobs||[]));cursor=p.hasMore?p.cursor:undefined;}while(cursor);return out;}
async function read(path,a){const {get}=await import('@vercel/blob');const r=await get(path,{access:'private',useCache:false,...a});if(!r||r.statusCode!==200)return null;try{return JSON.parse(await new Response(r.stream).text());}catch(_){return null;}}
function inc(o,k){k=k||'(none)';o[k]=(o[k]||0)+1;}

module.exports=async function(req,res){
 if(req.method!=='GET'){res.setHeader('Allow','GET');return json(res,405,{error:'Method not allowed'});}
 if(!authorized(req))return json(res,401,{error:'Unauthorized'});
 const a=auth();if(!a)return json(res,503,{error:'Storage unavailable'});
 const campaign=String(req.query&&req.query.campaign||'');
 const since=new Date('2026-10-07T00:00:00Z');
 const until=new Date('2026-10-09T23:59:59Z');
 const excluded=new Set(['assistant-smoke-test','assistant-funnel-test']);
 const days=['2026-10-07','2026-10-08','2026-10-09'];
 const land=[], funnel=[];
 for(const day of days){
   for(const b of await listAll('analytics/landing-views/'+day+'/',a)){
     const e=await read(b.pathname,a);if(!e)continue;
     const t=new Date(e.occurredAt);if(t<since||t>until||excluded.has(e.utmSource))continue;
     if(campaign&&e.utmCampaign!==campaign)continue;
     land.push(e);
   }
   for(const b of await listAll('analytics/funnel/'+day+'/',a)){
     const e=await read(b.pathname,a);if(!e)continue;
     const t=new Date(e.occurredAt);if(t<since||t>until||excluded.has(e.utmSource))continue;
     if(campaign&&e.utmCampaign!==campaign)continue;
     funnel.push(e);
   }
 }
 const bySource={},byContent={},byRef={},byHour={},funnelCounts={},funnelByContent={};
 for(const e of land){inc(bySource,e.utmSource);inc(byContent,e.utmContent);inc(byRef,e.referrerHost);inc(byHour,String(e.occurredAt).slice(0,13)+':00Z');}
 for(const e of funnel){inc(funnelCounts,e.event);const k=(e.utmContent||'(none)')+' | '+e.event;inc(funnelByContent,k);}
 land.sort((a,b)=>String(a.occurredAt).localeCompare(String(b.occurredAt)));
 return json(res,200,{
   campaign,
   landingViews:land.length,
   bySource,byContent,byRef,byHour,
   funnelCounts,funnelByContent,
   landingEvents:land.map(e=>({
     occurredAt:e.occurredAt,utmSource:e.utmSource||'',utmMedium:e.utmMedium||'',utmContent:e.utmContent||'',utmTerm:e.utmTerm||'',referrerHost:e.referrerHost||'',hasFbclid:e.hasFbclid===true
   })),
   funnelEvents:funnel.map(e=>({event:e.event,occurredAt:e.occurredAt,utmSource:e.utmSource||'',utmContent:e.utmContent||'',details:e.details||{}}))
 });
};