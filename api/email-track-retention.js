/* Vercel Cron cleanup, inactive while MMC_EMAIL_TRACKING_ENABLED is unset.
 * Deletes event blobs older than 90 days. Separate individual erasure endpoint
 * handles consent withdrawal and data erasure on request.
 */
const crypto = require('node:crypto');
const { isEnabled } = require('../lib/lead-email-tracking');

const EVENT_ROOT = 'email-tracking/v1/events/';
const RETENTION_DAYS = 90;
const MAX_PAGES = 50;

function authorized(req) {
  const secret = process.env.CRON_SECRET || '';
  const header = req.headers.authorization || '';
  if (secret.length < 16 || typeof header !== 'string') return false;
  const received = header.startsWith('Bearer ') ? header.slice(7) : '';
  const a = crypto.createHash('sha256').update(secret).digest();
  const b = crypto.createHash('sha256').update(received).digest();
  return crypto.timingSafeEqual(a,b);
}

function blobAuth() {
  if (process.env.BLOB_READ_WRITE_TOKEN) return {token: process.env.BLOB_READ_WRITE_TOKEN};
  if (process.env.VERCEL_OIDC_TOKEN && process.env.BLOB_STORE_ID)
    return {oidcToken:process.env.VERCEL_OIDC_TOKEN,storeId:process.env.BLOB_STORE_ID};
  return null;
}
function done(res,code,body) {
  res.statusCode=code;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  res.end(JSON.stringify(body));
}

module.exports=async function handler(req,res) {
  if(req.method!=='GET'){res.setHeader('Allow','GET');return done(res,405,{error:'Method not allowed'});}
  if(!authorized(req))return done(res,401,{error:'Unauthorized'});
  if(!isEnabled())return done(res,200,{ok:true,trackingEnabled:false,deleted:0});
  const auth=blobAuth();
  if(!auth)return done(res,503,{error:'Private storage not configured'});
  const cutoff=Date.now()-RETENTION_DAYS*86400000;
  let removed=0,scanned=0, cursor, pages=0;
  const { list, del } = await import('@vercel/blob');
  try {
    do {
      const page=await list({prefix:EVENT_ROOT,cursor,limit:1000,...auth});
      const paths=[];
      for(const blob of page.blobs||[]) {
        scanned++;
        const file=String(blob.pathname||'').split('/').pop();
        const match=/^(\d{13})-(open|click)-[a-f0-9-]+\.json$/.exec(file);
        if(match && Number(match[1])<cutoff) paths.push(blob.pathname);
      }
      for(let i=0;i<paths.length;i+=100){
        const batch=paths.slice(i,i+100);
        await del(batch,auth);
        removed+=batch.length;
      }
      cursor=page.hasMore?page.cursor:undefined;
      pages++;
    } while(cursor && pages<MAX_PAGES);
    return done(res,200,{ok:true,retentionDays:RETENTION_DAYS,scanned,deleted:removed,complete:!cursor});
  } catch(e){
    console.error('Email tracking retention job failed');
    return done(res,503,{error:'Retention cleanup failed',deleted:removed});
  }
};
module.exports.default=module.exports;
