'use strict';
const {ISSUER,RESOURCE,SCOPE,config}=require('./first-party-oauth');
module.exports=function handler(req,res){
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET'){res.statusCode=405;return res.end(JSON.stringify({error:'Method not allowed'}));}
  if(!config()){res.statusCode=503;return res.end(JSON.stringify({error:'OAuth not configured'}));}
  res.statusCode=200;
  res.end(JSON.stringify({
    issuer:ISSUER,
    authorization_endpoint:ISSUER+'/oauth/authorize',
    token_endpoint:ISSUER+'/oauth/token',
    response_types_supported:['code'],
    grant_types_supported:['authorization_code','refresh_token'],
    token_endpoint_auth_methods_supported:['none'],
    code_challenge_methods_supported:['S256'],
    client_id_metadata_document_supported:true,
    authorization_response_iss_parameter_supported:true,
    scopes_supported:[SCOPE]
  }));
};
