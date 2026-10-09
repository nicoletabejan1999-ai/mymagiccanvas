'use strict';
const {
  RESOURCE,SCOPE,config,parseAuthorizationCode,parseRefresh,verifyPkce,
  markOnce,issueAccess,issueRefresh,isRedirectAllowed
}=require('./first-party-oauth');
function respond(res,status,data){
  res.statusCode=status;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Pragma','no-cache');
  return res.end(JSON.stringify(data));
}
module.exports=async function handler(req,res){
  if(req.method!=='POST'){res.setHeader('Allow','POST');return respond(res,405,{error:'invalid_request'});}
  const cfg=config();
  if(!cfg)return respond(res,503,{error:'temporarily_unavailable'});
  let body=req.body;
  if(typeof body==='string'&&body.length<16000)body=Object.fromEntries(new URLSearchParams(body));
  if(!body||typeof body!=='object')return respond(res,400,{error:'invalid_request'});
  const grant=String(body.grant_type||'');
  const client=String(body.client_id||'');
  if(grant!=='authorization_code'&&grant!=='refresh_token')return respond(res,400,{error:'unsupported_grant_type'});
  if(!isRedirectAllowed(client,String(body.redirect_uri||'https://chatgpt.com/connector_platform_oauth_redirect')))
    return respond(res,400,{error:'invalid_client'});
  if(body.resource!==RESOURCE)return respond(res,400,{error:'invalid_target'});
  try {
    if(grant==='authorization_code'){
      const data=parseAuthorizationCode(String(body.code||''),cfg);
      if(data.client!==client || data.redirect!==body.redirect_uri ||
        !verifyPkce(String(body.code_verifier||''),data.challenge))throw new Error('Invalid code or PKCE');
      await markOnce('code',data.jti);
    }else{
      const data=parseRefresh(String(body.refresh_token||''),cfg);
      if(data.client!==client)throw new Error('Invalid refresh client');
      await markOnce('refresh',data.jti);
    }
    return respond(res,200,{access_token:issueAccess(cfg),token_type:'Bearer',expires_in:900,refresh_token:issueRefresh(cfg,client),scope:SCOPE});
  }catch(error){
    if(error.message==='OAuth replay store unavailable')return respond(res,503,{error:'temporarily_unavailable'});
    return respond(res,400,{error:'invalid_grant'});
  }
};
