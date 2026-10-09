'use strict';
const {RESOURCE,config,verifyAccess}=require('../lib/first-party-oauth');
const {parseInterval,collectReport}=require('../lib/analytics-report');
const METADATA='https://mymagiccanvas.vercel.app/.well-known/oauth-protected-resource';
function respond(res,status,body){
  res.statusCode=status;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','private, no-store');
  res.end(JSON.stringify(body));
}
function challenge(res) {
  res.setHeader('WWW-Authenticate','Bearer resource_metadata="'+METADATA+'", scope="analytics:read"');
  return respond(res,401,{error:'Authentication required'});
}
function blobAuth(){
  if(process.env.BLOB_READ_WRITE_TOKEN)return {token:process.env.BLOB_READ_WRITE_TOKEN};
  if(process.env.VERCEL_OIDC_TOKEN&&process.env.BLOB_STORE_ID)return {oidcToken:process.env.VERCEL_OIDC_TOKEN,storeId:process.env.BLOB_STORE_ID};
  return null;
}
module.exports=async function handler(req,res){
  if(!['GET','POST'].includes(req.method)){
    res.setHeader('Allow','GET, POST');
    return respond(res,405,{error:'Method not allowed'});
  }
  const cfg=config();
  if(!cfg)return respond(res,503,{error:'Private MCP connector not configured'});
  // Protect against cross-origin browser traffic. ChatGPT sends server-to-server.
  if(req.headers.origin)return respond(res,403,{error:'Origin not allowed'});
  const match=/^Bearer (\S+)$/.exec(String(req.headers.authorization||''));
  if(!match||!verifyAccess(match[1],cfg))return challenge(res);
  try{
    const {createMcpHandler,McpServer}=await import('@modelcontextprotocol/server');
    const {z}=await import('zod');
    const mcp=createMcpHandler(()=>{
      const server=new McpServer({name:'mymagiccanvas-first-party',version:'1.0.0'},{capabilities:{tools:{}}});
      server.registerTool('first_party_analytics_report',{
        title:'MyMagiCanvas first-party site interactions',
        description:'Returns real aggregate site interactions by Google Ads, Meta Ads, Pinterest, other and unattributed traffic. Does not include ad-platform click counts, visitors or individual events.',
        inputSchema:z.object({
          start:z.string().describe('Inclusive ISO 8601 timestamp with timezone, e.g. 2026-10-09T05:00:00Z'),
          end:z.string().describe('Exclusive ISO 8601 timestamp with timezone')
        }),
        annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}
      },async ({start,end})=>{
        try{
          const interval=parseInterval({start,end});
          const storage=blobAuth();
          if(!storage)throw new Error('storage unavailable');
          const blob=await import('@vercel/blob');
          const report=await collectReport(interval,blob,storage);
          return {content:[{type:'text',text:JSON.stringify(report)}],structuredContent:report};
        }catch(error){
          console.error('MCP reporting error',error && error.code || 'unknown');
          return {isError:true,content:[{type:'text',text:error instanceof RangeError?error.message:'Unable to generate complete report'}]};
        }
      });
      return server;
    });
    const headers=new Headers();
    for(const [name,value] of Object.entries(req.headers||{})){
      if(typeof value==='string' && !['host','content-length'].includes(name.toLowerCase()))headers.set(name,value);
    }
    const request=new Request(RESOURCE,{
      method:req.method,headers,
      ...(req.method==='POST'?{body:JSON.stringify(req.body||{})}:{})
    });
    const response=await mcp.fetch(request,{parsedBody:req.body});
    res.statusCode=response.status;
    for(const [key,value] of response.headers.entries()){
      if(!['set-cookie','content-length'].includes(key.toLowerCase()))res.setHeader(key,value);
    }
    res.setHeader('Cache-Control','private, no-store');
    return res.end(Buffer.from(await response.arrayBuffer()));
  }catch(error){
    console.error('MCP connection error',error && error.message);
    if(!res.headersSent)return respond(res,503,{error:'MCP temporarily unavailable'});
  }
};
