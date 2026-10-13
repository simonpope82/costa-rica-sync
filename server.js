// Tiny sync server for the trip app. No dependencies.
// Env: TRIP_PASSWORD (shared), GITHUB_TOKEN + DATA_REPO (owner/repo, private) for durable storage,
// or DATA_FILE for local testing. ALLOW_ORIGIN (default *).
const http=require('http'),fs=require('fs');
const PORT=process.env.PORT||8790,PW=process.env.TRIP_PASSWORD||'',TOKEN=process.env.GITHUB_TOKEN,REPO=process.env.DATA_REPO,
PATH_=process.env.DATA_PATH||'data.json',FILE=process.env.DATA_FILE,ORIGIN=process.env.ALLOW_ORIGIN||'*';
let doc=null,sha=null,dirty=false,saving=false;
const gh=(m,b)=>fetch(`https://api.github.com/repos/${REPO}/contents/${PATH_}`,{method:m,headers:{Authorization:'Bearer '+TOKEN,'User-Agent':'trip-sync',Accept:'application/vnd.github+json'},body:b&&JSON.stringify(b)});
async function load(){
  if(doc)return doc;
  if(TOKEN&&REPO){const r=await gh('GET');if(r.ok){const j=await r.json();sha=j.sha;doc=JSON.parse(Buffer.from(j.content,'base64').toString('utf8'));}}
  else if(FILE&&fs.existsSync(FILE))doc=JSON.parse(fs.readFileSync(FILE,'utf8'));
  if(!doc)doc={v:1,meta:{},items:{}};return doc;}
async function save(){ if(saving){dirty=true;return;} saving=true;dirty=false;
  try{const txt=JSON.stringify(doc);
    if(TOKEN&&REPO){const r=await gh('PUT',{message:'sync',content:Buffer.from(txt).toString('base64'),sha});const j=await r.json();
      if(r.ok)sha=j.content.sha;else{console.error('save failed',r.status,j.message);if(r.status===409){const g=await (await gh('GET')).json();sha=g.sha;dirty=true;}}}
    else if(FILE)fs.writeFileSync(FILE,txt);}
  catch(e){console.error(e);dirty=true}
  saving=false; if(dirty)setTimeout(save,1500);}
function merge(inc){let n=0;for(const[id,it]of Object.entries(inc.items||{})){const c=doc.items[id];if(!c||(it.u||0)>(c.u||0)){doc.items[id]=it;n++;}}
  if(inc.meta&&(inc.meta.u||0)>(doc.meta.u||0)){doc.meta=inc.meta;n++;}return n;}
const cors={'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Headers':'content-type,x-trip-key','Access-Control-Allow-Methods':'GET,POST,OPTIONS'};
function send(res,c,o){res.writeHead(c,{...cors,'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(o));}
http.createServer(async(req,res)=>{
  if(req.method==='OPTIONS'){res.writeHead(204,cors);return res.end();}
  if(req.url==='/health')return send(res,200,{ok:true});
  if(!req.url.startsWith('/api/'))return send(res,404,{error:'not found'});
  if(!PW||req.headers['x-trip-key']!==PW)return send(res,401,{error:'wrong password'});
  try{await load();
    if(req.method==='GET'&&req.url==='/api/doc')return send(res,200,doc);
    if(req.method==='POST'&&req.url==='/api/sync'){let b='';for await(const c of req){b+=c;if(b.length>5e6)return send(res,413,{});}
      const inc=JSON.parse(b||'{}');const n=merge(inc);if(n)save();return send(res,200,doc);}
    send(res,404,{error:'not found'});}catch(e){console.error(e);send(res,500,{error:String(e.message||e)});}
}).listen(PORT,()=>console.log('trip sync on',PORT));
