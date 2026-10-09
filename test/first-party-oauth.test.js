'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const auth=require('../lib/first-party-oauth');

function withConfig(run){
  const before=[process.env.MMC_OAUTH_SIGNING_SECRET,process.env.MMC_OAUTH_OWNER_PASSWORD];
  process.env.MMC_OAUTH_SIGNING_SECRET='sample-very-long-signing-secret-longer-than-48-bytes-012345';
  process.env.MMC_OAUTH_OWNER_PASSWORD='sample-owner-passphrase-very-long-0123456789';
  try{return run();}finally{
    for(const [i,key] of ['MMC_OAUTH_SIGNING_SECRET','MMC_OAUTH_OWNER_PASSWORD'].entries()){
      if(before[i]===undefined) delete process.env[key]; else process.env[key]=before[i];
    }
  }
}
test('fails closed if credentials missing',()=>{
  const secret=process.env.MMC_OAUTH_SIGNING_SECRET,pwd=process.env.MMC_OAUTH_OWNER_PASSWORD;
  delete process.env.MMC_OAUTH_SIGNING_SECRET;delete process.env.MMC_OAUTH_OWNER_PASSWORD;
  try{assert.equal(auth.config(),null);}finally{
    if(secret!==undefined)process.env.MMC_OAUTH_SIGNING_SECRET=secret;
    if(pwd!==undefined)process.env.MMC_OAUTH_OWNER_PASSWORD=pwd;
  }
});
test('seals secrets with AES-GCM and rejects any tampering',()=>withConfig(()=>{
  const cfg=auth.config();
  const encrypted=auth.seal({a:'test'},cfg);
  assert.deepEqual(auth.unseal(encrypted,cfg),{a:'test'});
  const parts=encrypted.split('.');
  parts[2]=parts[2].slice(0,-2)+'ab';
  assert.throws(()=>auth.unseal(parts.join('.'),cfg));
}));
test('access tokens verify audience, signature and expiry',()=>withConfig(()=>{
  const cfg=auth.config();
  const token=auth.issueAccess(cfg);
  assert.equal(auth.verifyAccess(token,cfg),true);
  assert.equal(auth.verifyAccess(token+'x',cfg),false);
  assert.equal(auth.verifyAccess('',cfg),false);
  assert.equal(auth.verifyAccess('aaa.bbb.ccc',cfg),false);
}));
test('strict, trusted OAuth client, redirect, PKCE and resource',()=>withConfig(()=>{
  const client='https://chatgpt.com/oauth/client.json';
  const redirect='https://chatgpt.com/connector_platform_oauth_redirect';
  assert.equal(auth.isRedirectAllowed(client,redirect),true);
  assert.equal(auth.isRedirectAllowed('https://attacker.com',redirect),false);
  assert.equal(auth.isRedirectAllowed(client,'https://attacker.com/callback'),false);
  const verifier='correct_horse_battery_staple_0123456789012345';
  const challenge=require('node:crypto').createHash('sha256').update(verifier).digest('base64url');
  const request={response_type:'code',resource:auth.RESOURCE,client_id:client,redirect_uri:redirect,
    code_challenge_method:'S256',code_challenge:challenge,state:'unique-state',scope:auth.SCOPE};
  assert.equal(auth.parseAuthorize(request).client,client);
  assert.throws(()=>auth.parseAuthorize({...request,resource:'https://attacker.com'}));
  assert.equal(auth.verifyPkce(verifier,challenge),true);
  assert.equal(auth.verifyPkce('wrong-verifier',challenge),false);
  const cfg=auth.config();
  const code=auth.authorizeCode({client,redirect,challenge,scope:auth.SCOPE,resource:auth.RESOURCE},cfg);
  assert.equal(auth.parseAuthorizationCode(code,cfg).client,client);
  assert.equal(auth.verifyPassword(cfg.password,cfg),true);
  assert.equal(auth.verifyPassword('wrong',cfg),false);
  const refresh=auth.issueRefresh(cfg,client);
  assert.equal(auth.parseRefresh(refresh,cfg).client,client);
}));
