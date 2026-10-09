'use strict';
const {ISSUER,config,seal,unseal,validateClient,parseAuthorize,verifyPassword,authorizeCode}=require('./first-party-oauth');
function page(res,hidden,invalid){
  res.statusCode=invalid?401:200;
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Content-Security-Policy',"default-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
  // hidden is encrypted and base64url, so it cannot inject markup.
  return res.end('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Authorize MyMagiCanvas</title><main><h1>Connect MyMagiCanvas to ChatGPT</h1><p>Read-only access to first-party analytics counts. No customer or payment details.</p>'+(invalid?'<p>Authentication failed. Try again.</p>':'')+'<form method="POST" action="/oauth/authorize"><input type="hidden" name="request" value="'+hidden+'"><label>MyMagiCanvas owner passphrase <input name="password" type="password" required minlength="24" autocomplete="current-password"></label><button type="submit">Authorize read-only analytics</button></form></main></html>');
}
function error(res,status,text){
  res.statusCode=status;res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');
  res.end(JSON.stringify({error:text}));
}
module.exports=async function handler(req,res){
  const cfg=config();
  if(!cfg)return error(res,503,'Owner authorization not configured');
  if(req.method==='GET'){
    let request;
    try{request=parseAuthorize(req.query||{});await validateClient(request.client,request.redirect);}
    catch(_){return error(res,400,'Invalid OAuth client request');}
    const challenge=seal({type:'pending',request,exp:Date.now()+300000},cfg);
    return page(res,challenge,false);
  }
  if(req.method!=='POST'){res.setHeader('Allow','GET, POST');return error(res,405,'Method not allowed');}
  let body=req.body;
  if(typeof body==='string' && body.length<16000)body=Object.fromEntries(new URLSearchParams(body));
  if(!body||typeof body!=='object')return error(res,400,'Invalid request');
  let challenge,request;
  try{
    const raw=String(body.request||'');
    challenge=unseal(raw,cfg);
    if(challenge.type!=='pending'||!Number.isSafeInteger(challenge.exp)||challenge.exp<Date.now())throw new Error('Expired request');
    request=challenge.request;
    if(!request||!request.client||!request.redirect||!request.challenge)throw new Error('Invalid request');
  }catch(_){return error(res,400,'Authorization request expired');}
  if(!verifyPassword(body.password,cfg))return page(res,String(body.request||''),true);
  try{await validateClient(request.client,request.redirect);}catch(_){return error(res,400,'Client verification failed');}
  const code=authorizeCode({
    client:request.client,redirect:request.redirect,challenge:request.challenge,
    resource:request.resource,scope:request.scope
  },cfg);
  const redirect=new URL(request.redirect);
  redirect.searchParams.set('code',code);
  redirect.searchParams.set('state',request.state);
  redirect.searchParams.set('iss',ISSUER);
  res.statusCode=302;
  res.setHeader('Location',redirect.toString());
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Referrer-Policy','no-referrer');
  return res.end();
};
