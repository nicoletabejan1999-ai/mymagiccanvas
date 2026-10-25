const { isEnabled, isAdmin, isValidToken } = require('../lib/lead-email-tracking');
const crypto = require('node:crypto');

function json(res,code,body){
  res.statusCode=code;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','private, no-store');
  res.end(JSON.stringify(body));
}
function authStorage() {
  if(process.env.BLOB_READ_WRITE_TOKEN)return {token:process.env.BLOB_READ_WRITE_TOKEN};
  if(process.env.VERCEL_OIDC_TOKEN&&process.env.BLOB_STORE_ID)
    return {oidcToken:process.env.VERCEL_OIDC_TOKEN,storeId:process.env.BLOB_STORE_ID};
  return null;
}
// Erase consent and event records for an individual opaque tracking token.
// After consent is removed, future pixel fetches cannot create new events.
module.exports=async function handler(req,res){
  if(req.method!=='POST'){res.setHeader('Allow','POST');return json(res,405,{error:'Method not allowed'});}
  if(!isAdmin(req))return json(res,403,{error:'Forbidden'});
  if(!isEnabled())return json(res,503,{error:'Tracking disabled'});
  let body=req.body;
  if(typeof body==='string'){try{body=JSON.parse(body)}catch(_){body=null}}
  const token=body && body.token;
  if(!isValidToken(token))return json(res,400,{error:'Invalid opaque token'});
  const auth=authStorage();
  if(!auth)return json(res,503,{error:'Private storage not configured'});
  const hash=crypto.createHash('sha256').update(token,'utf8').digest('hex');
  const prefix='email-tracking/v1/events/'+hash+'/';
  const consentPath='email-tracking/v1/consent/'+hash+'.json';
  try {
    const { list, del }=await import('@vercel/blob');
    // Deauthorize immediately, before deleting historical event blobs.
    await del(consentPath,auth);
    let cursor,deleted=0;
    do {
      const page=await list({prefix,cursor,limit:1000,...auth});
      const paths=(page.blobs||[]).map(x=>x.pathname);
      for(let i=0;i<paths.length;i+=100){
        const batch=paths.slice(i,i+100);
        await del(batch,auth);
        deleted+=batch.length;
      }
      cursor=page.hasMore?page.cursor:undefined;
    }while(cursor);
    return json(res,200,{ok:true,deletedEvents:deleted});
  }catch(e){
    console.error('Email tracking erasure incomplete');
    return json(res,503,{error:'Erasure incomplete; retry with same token'});
  }
};
module.exports.default=module.exports;
