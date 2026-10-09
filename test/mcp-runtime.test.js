'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {issueAccess,config}=require('../lib/first-party-oauth');
const handler=require('../api/mcp');

function response(){
  return {
    statusCode:200,headers:{},headersSent:false,
    setHeader(name,value){this.headers[name.toLowerCase()]=value;},
    end(value){this.body=Buffer.isBuffer(value)?value.toString('utf8'):String(value||'');this.headersSent=true;}
  };
}
function environment(fn){
  const s=process.env.MMC_OAUTH_SIGNING_SECRET,p=process.env.MMC_OAUTH_OWNER_PASSWORD;
  process.env.MMC_OAUTH_SIGNING_SECRET='integration-only-unused-signing-secret-at-least-forty-eight-characters';
  process.env.MMC_OAUTH_OWNER_PASSWORD='integration-test-owner-password-strong-and-long';
  return Promise.resolve().then(fn).finally(()=>{
    if(s===undefined)delete process.env.MMC_OAUTH_SIGNING_SECRET; else process.env.MMC_OAUTH_SIGNING_SECRET=s;
    if(p===undefined)delete process.env.MMC_OAUTH_OWNER_PASSWORD; else process.env.MMC_OAUTH_OWNER_PASSWORD=p;
  });
}
function request(method,body,token){
  return {method,query:{},headers:{
    'content-type':'application/json',
    accept:'application/json, text/event-stream',
    ...(token?{authorization:'Bearer '+token}:{})
  },body};
}
test('MCP refuses anonymous initialization',()=>environment(async()=>{
  const result=response();
  await handler(request('POST',{jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'test',version:'1'}}}),result);
  assert.equal(result.statusCode,401);
  assert.match(result.headers['www-authenticate'],/oauth-protected-resource/);
}));
test('MCP initializes and lists read-only first party analytics tool with signed token',()=>environment(async()=>{
  const token=issueAccess(config());
  const init=response();
  await handler(request('POST',{jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'test',version:'1'}}},token),init);
  assert.equal(init.statusCode,200,init.body.slice(0,1000));
  assert.match(init.body,/mymagiccanvas-first-party/);
  const list=response();
  await handler(request('POST',{jsonrpc:'2.0',id:2,method:'tools/list',params:{}},token),list);
  assert.equal(list.statusCode,200,list.body.slice(0,1000));
  assert.match(list.body,/first_party_analytics_report/);
}));
