// 금주의 할 일 (관리자 전용). 한 주는 월요일 날짜(week_start)로 구분하고, 주마다 목록이 따로 저장됩니다.
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const fail=message=>Object.assign(new Error(message),{status:400});
const validId=id=>typeof id==='string'&&/^[a-zA-Z0-9-]{1,80}$/.test(id);
const MAX_PER_WEEK=100;
// migrations/0008_week_todos.sql 와 같은 내용입니다 (tests/week-todos.test.mjs 가 서로 같은지 확인해요).
// 배포 과정에서 마이그레이션이 빠져도 금주의 할 일이 동작하도록, 처음 쓸 때 한 번 없으면 만들어둡니다.
export const SCHEMA=[
  'CREATE TABLE IF NOT EXISTS week_todos (id TEXT PRIMARY KEY, week_start TEXT NOT NULL, title TEXT NOT NULL, is_done INTEGER NOT NULL DEFAULT 0, sort_order REAL NOT NULL DEFAULT 0, created_at TEXT NOT NULL)',
  'CREATE INDEX IF NOT EXISTS week_todos_week ON week_todos(week_start)'
];
const ready=new WeakMap();
const ensureSchema=db=>{
  if(!ready.has(db))ready.set(db,(async()=>{for(const sql of SCHEMA)await db.prepare(sql).run();})().catch(error=>{ready.delete(db);throw error;}));
  return ready.get(db);
};
// YYYY-MM-DD 이면서 실제로 있는 날짜이고 월요일이어야 합니다.
export const validWeek=week=>typeof week==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(week)&&(d=>!Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===week&&d.getUTCDay()===1)(new Date(week+'T00:00:00Z'));
const cleanTitle=title=>{
  if(typeof title!=='string')throw fail('할 일을 적어주세요.');
  const text=title.trim();
  if(!text)throw fail('할 일을 적어주세요.');
  if(text.length>120)throw fail('할 일은 120자까지 적을 수 있어요.');
  return text;
};
export async function weekTodos(request,env){
  const db=env.DB;
  await ensureSchema(db);
  const list=async week=>(await db.prepare('SELECT id,week_start,title,is_done,sort_order FROM week_todos WHERE week_start=? ORDER BY sort_order,created_at,id').bind(week).all()).results.map(row=>({...row,is_done:Boolean(row.is_done)}));
  if(request.method==='GET'){
    const week=new URL(request.url).searchParams.get('week');
    if(!validWeek(week))throw fail('주 정보가 올바르지 않아요.');
    return json({data:await list(week)});
  }
  if(request.method!=='POST')return json({error:'Method not allowed'},405);
  if(!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'JSON required'},415);
  const text=await request.text();
  if(text.length>5000)return json({error:'요청이 너무 커요.'},413);
  let q;try{q=JSON.parse(text);}catch{throw fail('Invalid JSON');}
  if(!q||typeof q!=='object')throw fail('Invalid request');
  if(q.action==='add'){
    if(!validWeek(q.week))throw fail('주 정보가 올바르지 않아요.');
    const title=cleanTitle(q.title);
    const {n,c}=await db.prepare('SELECT COALESCE(MAX(sort_order),0)+1 AS n, COUNT(*) AS c FROM week_todos WHERE week_start=?').bind(q.week).first();
    if(c>=MAX_PER_WEEK)throw fail('한 주에는 '+MAX_PER_WEEK+'개까지 적을 수 있어요.');
    await db.prepare('INSERT INTO week_todos(id,week_start,title,is_done,sort_order,created_at) VALUES(?,?,?,0,?,?)').bind(crypto.randomUUID(),q.week,title,n,new Date().toISOString()).run();
    return json({data:await list(q.week)});
  }
  if(!['toggle','rename','delete'].includes(q.action))throw fail('Unknown action');
  if(!validId(q.id))throw fail('Invalid id');
  const row=await db.prepare('SELECT week_start FROM week_todos WHERE id=?').bind(q.id).first();
  if(!row)throw fail('이미 지워진 할 일이에요.');
  if(q.action==='toggle'){
    if(typeof q.done!=='boolean')throw fail('Invalid value');
    await db.prepare('UPDATE week_todos SET is_done=? WHERE id=?').bind(q.done?1:0,q.id).run();
  }else if(q.action==='rename'){
    await db.prepare('UPDATE week_todos SET title=? WHERE id=?').bind(cleanTitle(q.title),q.id).run();
  }else{
    // 지운 할 일은 저장소에서도 바로 지웁니다.
    await db.prepare('DELETE FROM week_todos WHERE id=?').bind(q.id).run();
  }
  return json({data:await list(row.week_start)});
}
