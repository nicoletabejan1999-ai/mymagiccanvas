'use strict';
// Single serverless function for OAuth discovery, authorization and token
// exchange. Consolidated to stay below the existing Vercel Hobby function cap.
const handlers={
  'authorization-metadata':require('../lib/oauth-metadata'),
  'resource-metadata':require('../lib/mcp-resource-meta'),
  'authorize':require('../lib/oauth-authorize'),
  'token':require('../lib/oauth-token')
};
module.exports=async function handler(req,res){
  const mode=String(req.query&&req.query.mode||'');
  const selected=handlers[mode];
  if(!selected){res.statusCode=404;return res.end('Not found');}
  return selected(req,res);
};
