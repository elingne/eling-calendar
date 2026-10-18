import {createRemoteJWKSet, jwtVerify} from 'jose';
const jwksCache=new Map();
const fields={
  events:['title','description','start_date','end_date','color_variant','is_completed','sort_order'],
  quick_todos:['title','is_completed','is_important','sort_order','completed_at'],
  todos:['title','target_date','is_completed','completed_at','sort_order'],
  schedule_notes:['body','note_date','sort_order'],
  moods:['record_date','mood_type','reason'],
  period_records:['start_date','end_date']
};
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const json=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export async function owner(request,env) {
  if(!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD || !env.OWNER_EMAIL) return false;
  const team=env.ACCESS_TEAM_DOMAIN.replace(/^https:\/\//,'').replace(/\/$/,'');
  if(!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(team)) return false;
  const cookie=request.headers.get('Cookie')?.match(/(?:^|;\s*)CF_Authorization=([^;]+)/)?.[1];
  const token=request.headers.get('Cf-Access-Jwt-Assertion') || cookie;
  if(!token) return false;
  try {
    if(!jwksCache.has(team)) jwksCache.set(team,createRemoteJWKSet(new URL(`https://${team}/cdn-cgi/access/certs`)));
    const {payload}=await jwtVerify(token,jwksCache.get(team),{issuer:`https://${team}`,audience:env.ACCESS_AUD,algorithms:['RS256']});
    return typeof payload.email==='string' && payload.email.toLowerCase()===env.OWNER_EMAIL.toLowerCase();
  } catch {return false;}
}
export function validateValues(table,values,partial=false) {
  if(!values || typeof values!=='object' || Array.isArray(values)) throw fail('Invalid values');
  for(const [key,value] of Object.entries(values)) {
    if(!fields[table].includes(key)) throw fail('Invalid field');
    if(value===null) { if(!['description','reason','completed_at','target_date'].includes(key))throw fail('Required field'); continue; }
    if(['is_completed','is_important'].includes(key)) {if(typeof value!=='boolean')throw fail('Invalid boolean');}
    else if(key==='sort_order') {if(typeof value!=='number'||!Number.isFinite(value)||Math.abs(value)>1e12)throw fail('Invalid order');}
    else {
      if(typeof value!=='string'||value.length>({title:120,body:300,description:500,reason:2000}[key]||100))throw fail('Invalid text');
      if(['title','body'].includes(key)&&!value.trim())throw fail('Empty text');
      if(key.endsWith('_date')&&(!/^\d{4}-\d{2}-\d{2}$/.test(value)||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value))throw fail('Invalid date');
      if(key==='completed_at'&&!Number.isFinite(Date.parse(value)))throw fail('Invalid timestamp');
      if(key==='color_variant'&&!['blue','pink'].includes(value))throw fail('Invalid color');
      if(key==='mood_type'&&!['happy','neutral','bad'].includes(value))throw fail('Invalid mood');
    }
  }
  if(!partial) {
    const required={events:['title','start_date','end_date'],quick_todos:['title'],todos:['title'],schedule_notes:['body','note_date'],moods:['record_date','mood_type'],period_records:['start_date','end_date']}[table];
    if(required.some(key=>!values[key]))throw fail('Missing field');
  }
  if(values.start_date&&values.end_date&&values.end_date<values.start_date)throw fail('Invalid date range');
  return values;
}
export async function query(db,q) {
  if(!q||!Object.hasOwn(fields,q.table)) throw fail('Unknown table');
  const {table,action='select',filters=[],orders=[]}=q;
  if(!['select','insert','update','delete','upsert'].includes(action)||!Array.isArray(filters)||filters.length>10||!Array.isArray(orders)||orders.length>5)throw fail('Invalid query');
  const allowed=['id','created_at',...fields[table]];
  const field=key=>{if(!allowed.includes(key))throw fail('Invalid column');return key==='id'?'id':`json_extract(data,'$.${key}')`;};
  const bindings=[table];
  const where=['collection=?'];
  for(const filter of filters) {
    if(!Array.isArray(filter)||filter.length!==3)throw fail('Invalid filter');
    const [key,op,value]=filter;
    if(op==='in') {
      if(!Array.isArray(value)||!value.length||value.length>500||value.some(v=>!['string','number'].includes(typeof v)))throw fail('Invalid list');
      where.push(`${field(key)} IN (${value.map(()=>'?').join(',')})`); bindings.push(...value); continue;
    }
    const operator={eq:'=',gte:'>=',lte:'<=',lt:'<'}[op];
    if(!operator||!['string','number','boolean'].includes(typeof value))throw fail('Invalid filter');
    where.push(`${field(key)} ${operator} ?`); bindings.push(typeof value==='boolean'?Number(value):value);
  }
  const condition=where.join(' AND ');
  if(action==='select') {
    const limit=q.limit;
    if(limit!==undefined&&(!Number.isInteger(limit)||limit<1||limit>10000))throw fail('Invalid limit');
    const sort=orders.map(([key,asc])=>`${field(key)} ${asc===false?'DESC':'ASC'}`).join(',');
    const result=await db.prepare(`SELECT data FROM records WHERE ${condition}${sort?' ORDER BY '+sort:''}${limit===undefined?'':' LIMIT ?'}`).bind(...bindings,...(limit===undefined?[]:[limit])).all();
    const rows=result.results.map(row=>JSON.parse(row.data));
    if(q.single&&rows.length>1)throw fail('Expected one record');
    return {data:q.single?(rows[0]||null):rows,error:null};
  }
  if(action==='delete'||action==='update') {
    if(!filters.length)throw fail('Filter required');
    // A partial date update is checked against each stored interval before committing.
    if(action==='update') {
      validateValues(table,q.values,true);
      const rows=await db.prepare(`SELECT data FROM records WHERE ${condition}`).bind(...bindings).all();
      for(const row of rows.results) {const merged={...JSON.parse(row.data),...q.values}; if(merged.start_date&&merged.end_date&&merged.end_date<merged.start_date)throw fail('Invalid date range');}
    }
    const sql=action==='delete'?`DELETE FROM records WHERE ${condition}`:`UPDATE records SET data=json_patch(data,?) WHERE ${condition}`;
    await db.prepare(sql).bind(...(action==='update'?[JSON.stringify(q.values),...bindings]:bindings)).run();
    return {data:null,error:null};
  }
  validateValues(table,q.values);
  if(action==='upsert'&&table!=='moods')throw fail('Upsert unsupported');
  const defaults={events:{color_variant:'blue',is_completed:false,sort_order:0},quick_todos:{is_completed:false,is_important:false,sort_order:0},todos:{is_completed:false},schedule_notes:{sort_order:0}};
  const data={...defaults[table],...q.values,created_at:new Date().toISOString()};
  let sql=`INSERT INTO records(collection,id,data) SELECT ?, COALESCE(MAX(id),0)+1,json_set(?,'$.id',COALESCE(MAX(id),0)+1) FROM records WHERE collection=?`;
  if(action==='upsert')sql+=` ON CONFLICT DO UPDATE SET data=json_set(excluded.data,'$.id',records.id,'$.created_at',json_extract(records.data,'$.created_at'))`;
  await db.prepare(sql).bind(table,JSON.stringify(data),table).run();
  return {data:null,error:null};
}
export default {
  async fetch(request,env) {
    const url=new URL(request.url);
    try {
      if(url.pathname==='/api/public/events'&&request.method==='GET') {
        const rows=await env.DB.prepare("SELECT data FROM records WHERE collection='events' ORDER BY json_extract(data,'$.start_date'),id").all();
        // Explicit projection: private descriptions and future added fields never leak.
        return json({data:rows.results.map(row=>{const e=JSON.parse(row.data);return {id:e.id,title:e.title,start_date:e.start_date,end_date:e.end_date,color_variant:e.color_variant,sort_order:e.sort_order};})});
      }
      if(url.pathname==='/api/session'&&request.method==='GET')return json({owner:await owner(request,env)});
      if(url.pathname==='/admin'||url.pathname.startsWith('/admin/')) {
        if(!await owner(request,env))return json({error:'Configure Cloudflare Access and sign in.'},401);
        return new Response(null,{status:302,headers:{Location:'/', 'Cache-Control':'no-store'}});
      }
      if(url.pathname==='/api/private/query') {
        if(!await owner(request,env))return json({error:'Unauthorized'},401);
        if(request.method!=='POST')return json({error:'Method not allowed'},405);
        if(request.headers.get('Origin')!==url.origin)return json({error:'Invalid origin'},403);
        if(!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'JSON required'},415);
        const text=await request.text();
        if(text.length>20000)return json({error:'Request too large'},413);
        let q;try{q=JSON.parse(text);}catch{throw fail('Invalid JSON');}
        return json(await query(env.DB,q));
      }
      if(url.pathname.startsWith('/api/'))return json({error:'Not found'},404);
      if(!['GET','HEAD'].includes(request.method))return json({error:'Method not allowed'},405);
      const response=await env.ASSETS.fetch(request);
      const secured=new Response(response.body,response);
      secured.headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
      secured.headers.set('X-Content-Type-Options','nosniff');
      secured.headers.set('Referrer-Policy','same-origin');
      return secured;
    } catch(error) {
      if(!error.status)console.error('Calendar API request failed');
      return json({data:null,error:{message:error.status?error.message:'서버 처리에 실패했어요.'}},error.status||500);
    }
  }
};
