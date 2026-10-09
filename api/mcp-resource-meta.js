'use strict';
const {ISSUER,RESOURCE,SCOPE,config}=require('../lib/first-party-oauth');
module.exports=function handler(req,res){
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET'){res.statusCode=405;return res.end(JSON.stringify({error:'Method not allowed'}));}
  if(!config()){res.statusCode=503;return res.end(JSON.stringify({error:'OAuth not configured'}));}
  res.statusCode=200;
  res.end(JSON.stringify({resource:RESOURCE,authorization_servers:[ISSUER],scopes_supported:[SCOPE],bearer_methods_supported:['header']}));
};
