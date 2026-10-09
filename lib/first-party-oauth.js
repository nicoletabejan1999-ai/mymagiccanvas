'use strict';

const crypto = require('node:crypto');

const ISSUER = 'https://mymagiccanvas.vercel.app';
const RESOURCE = ISSUER + '/api/mcp';
const SCOPE = 'analytics:read';
const BASE = 'https://chatgpt.com';
const CALLBACK_STABLE = BASE + '/connector_platform_oauth_redirect';

function config() {
  const secret = String(process.env.MMC_OAUTH_SIGNING_SECRET || '');
  const password = String(process.env.MMC_OAUTH_OWNER_PASSWORD || '');
  if (Buffer.byteLength(secret, 'utf8') < 48 || Buffer.byteLength(password, 'utf8') < 24) return null;
  return {
    enc: crypto.hkdfSync('sha256', Buffer.from(secret), Buffer.from('MMC OAuth v1'), Buffer.from('sealed-tokens'), 32),
    mac: crypto.hkdfSync('sha256', Buffer.from(secret), Buffer.from('MMC OAuth v1'), Buffer.from('access-signature'), 32),
    password
  };
}

function base64(value) { return Buffer.from(value).toString('base64url'); }
function digest(value) { return crypto.createHash('sha256').update(value).digest('base64url'); }
function equal(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x,y);
}

function seal(value, cfg) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(cfg.enc), iv);
  const plain = Buffer.from(JSON.stringify(value), 'utf8');
  if (plain.length > 6000) throw new Error('Payload too large');
  const ciphertext = Buffer.concat([cipher.update(plain),cipher.final()]);
  return 'v1.' + base64(iv) + '.' + base64(ciphertext) + '.' + base64(cipher.getAuthTag());
}
function unseal(raw,cfg) {
  if (typeof raw !== 'string' || raw.length > 12000) throw new Error('Invalid token');
  const match = /^v1\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(raw);
  if(!match) throw new Error('Invalid token');
  const iv=Buffer.from(match[1],'base64url'), body=Buffer.from(match[2],'base64url'),tag=Buffer.from(match[3],'base64url');
  if (iv.length!==12 || tag.length!==16) throw new Error('Invalid token');
  const decipher=crypto.createDecipheriv('aes-256-gcm',Buffer.from(cfg.enc),iv);
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(body),decipher.final()]).toString('utf8'));
}
function jwt(data,cfg) {
  const head=base64(JSON.stringify({alg:'HS256',typ:'JWT'}));
  const payload=base64(JSON.stringify(data));
  const signed=head+'.'+payload;
  return signed+'.'+base64(crypto.createHmac('sha256',Buffer.from(cfg.mac)).update(signed).digest());
}
function verifyAccess(raw,cfg) {
  if (!cfg || typeof raw !== 'string' || raw.length>5000) return false;
  const parts=raw.split('.');
  if(parts.length!==3) return false;
  const mac=base64(crypto.createHmac('sha256',Buffer.from(cfg.mac)).update(parts[0]+'.'+parts[1]).digest());
  if(!equal(parts[2],mac)) return false;
  let header,claims;
  try{header=JSON.parse(Buffer.from(parts[0],'base64url').toString());claims=JSON.parse(Buffer.from(parts[1],'base64url').toString());}catch(_){return false;}
  const now=Math.floor(Date.now()/1000);
  return header.alg==='HS256' && header.typ==='JWT' && claims.typ==='access' &&
    claims.iss===ISSUER && claims.aud===RESOURCE && claims.sub==='owner' &&
    claims.scope===SCOPE && Number.isInteger(claims.exp) && claims.exp>now &&
    Number.isInteger(claims.iat) && claims.iat<=now+30;
}
function issueAccess(cfg) {
  const now=Math.floor(Date.now()/1000);
  return jwt({iss:ISSUER,aud:RESOURCE,sub:'owner',scope:SCOPE,typ:'access',iat:now,exp:now+900,jti:crypto.randomUUID()},cfg);
}
function issueRefresh(cfg,client) {
  return seal({type:'refresh',client,resource:RESOURCE,exp:Date.now()+30*86400000,jti:crypto.randomUUID()},cfg);
}

function isRedirectAllowed(client,redirect) {
  if (typeof client!=='string' || typeof redirect!=='string') return false;
  const m=/^https:\/\/chatgpt\.com\/oauth\/(?:client\.json|([a-zA-Z0-9_-]{5,128})\/client\.json)$/.exec(client);
  if(!m) return false;
  if(redirect===CALLBACK_STABLE) return true;
  return /^https:\/\/chatgpt\.com\/connector\/oauth\/[a-zA-Z0-9_-]{5,128}$/.test(redirect)
    && (!m[1] || redirect.endsWith('/'+m[1]));
}
async function validateClient(client, redirect) {
  if (!isRedirectAllowed(client,redirect)) throw new Error('Unsupported client or redirect');
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),4000);
  try {
    const response=await fetch(client,{redirect:'error',signal:controller.signal,headers:{Accept:'application/json'}});
    if(!response.ok) throw new Error('CIMD client metadata unavailable');
    const raw=await response.text();
    if(raw.length>15000) throw new Error('CIMD metadata too large');
    const data=JSON.parse(raw);
    if(data.client_id!==client || !Array.isArray(data.redirect_uris) || !data.redirect_uris.includes(redirect)) throw new Error('CIMD metadata mismatch');
    const methods=data.token_endpoint_auth_methods_supported || [data.token_endpoint_auth_method];
    if(!Array.isArray(methods) || !methods.includes('none')) throw new Error('Client does not support public PKCE');
    return true;
  } finally {clearTimeout(timer);}
}
function parseAuthorize(q) {
  if(q.response_type!=='code' || q.resource!==RESOURCE) throw new Error('Unsupported OAuth authorization request');
  if(!isRedirectAllowed(q.client_id,q.redirect_uri)) throw new Error('Unsupported client redirect');
  if(q.code_challenge_method!=='S256' || !/^[A-Za-z0-9_-]{43}$/.test(String(q.code_challenge || ''))) throw new Error('PKCE S256 required');
  if(!q.state || String(q.state).length>4000) throw new Error('State required');
  const scope=String(q.scope||'').trim();
  if(scope!==SCOPE) throw new Error('Invalid OAuth scope');
  return {client:q.client_id,redirect:q.redirect_uri,challenge:q.code_challenge,state:q.state,resource:RESOURCE,scope:SCOPE};
}
function verifyPassword(value,cfg) { return cfg && equal(String(value||''),cfg.password); }
function authorizeCode(data,cfg) {
  return seal({...data,type:'code',exp:Date.now()+120000,jti:crypto.randomUUID()},cfg);
}
function parseAuthorizationCode(token,cfg) {
  const item=unseal(token,cfg);
  if(item.type!=='code' || !Number.isSafeInteger(item.exp) || item.exp < Date.now() ||
     item.resource!==RESOURCE || item.scope!==SCOPE || !item.jti || !item.challenge) throw new Error('Invalid authorization code');
  return item;
}
function parseRefresh(token,cfg) {
  const item=unseal(token,cfg);
  if(item.type!=='refresh'||!Number.isSafeInteger(item.exp)||item.exp<Date.now()||
     item.resource!==RESOURCE||!item.jti) throw new Error('Invalid refresh token');
  return item;
}
function verifyPkce(verifier,challenge) {
  return typeof verifier==='string' && /^[A-Za-z0-9_.~-]{43,128}$/.test(verifier) && equal(digest(verifier),challenge);
}

async function markOnce(type,jti){
  // Blob put is create-only by default; a duplicate pathname must fail.
  const {put}=await import('@vercel/blob');
  const auth=process.env.BLOB_READ_WRITE_TOKEN ? {token:process.env.BLOB_READ_WRITE_TOKEN}
    : (process.env.BLOB_STORE_ID && process.env.VERCEL_OIDC_TOKEN) ? {storeId:process.env.BLOB_STORE_ID,oidcToken:process.env.VERCEL_OIDC_TOKEN} : null;
  if(!auth) throw new Error('OAuth replay store unavailable');
  // A redemption must map to exactly one key, even when replayed across a UTC
  // date boundary. A date-derived path would incorrectly accept it again.
  await put('analytics/oauth-redemptions/'+type+'/'+digest(jti).slice(0,2)+'/'+digest(jti)+'.json',
    JSON.stringify({consumedAt:new Date().toISOString()}),
    {access:'private',addRandomSuffix:false,allowOverwrite:false,contentType:'application/json',...auth});
}

module.exports={ISSUER,RESOURCE,SCOPE,config,seal,unseal,verifyAccess,issueAccess,issueRefresh,isRedirectAllowed,validateClient,parseAuthorize,verifyPassword,authorizeCode,parseAuthorizationCode,parseRefresh,verifyPkce,markOnce};
