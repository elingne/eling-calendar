// 금주의 메모 (관리자 전용). 한 주는 월요일 날짜(week_start)로 구분하고, 주마다 메모지 한 장이 따로 저장됩니다.
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const fail=message=>Object.assign(new Error(message),{status:400});
const MAX_BODY=10000;
// migrations/0009_week_memos.sql 와 같은 내용입니다 (tests/week-memo.test.mjs 가 서로 같은지 확인해요).
// 배포 과정에서 마이그레이션이 빠져도 금주의 메모가 동작하도록, 처음 쓸 때 한 번 없으면 만들어둡니다.
export const SCHEMA=[
  'CREATE TABLE IF NOT EXISTS week_memos (week_start TEXT PRIMARY KEY, body TEXT NOT NULL, updated_at TEXT NOT NULL)'
];
const ready=new WeakMap();
const ensureSchema=db=>{
  if(!ready.has(db))ready.set(db,(async()=>{for(const sql of SCHEMA)await db.prepare(sql).run();})().catch(error=>{ready.delete(db);throw error;}));
  return ready.get(db);
};
// YYYY-MM-DD 이면서 실제로 있는 날짜이고 월요일이어야 합니다.
export const validWeek=week=>typeof week==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(week)&&(d=>!Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===week&&d.getUTCDay()===1)(new Date(week+'T00:00:00Z'));
export async function weekMemo(request,env){
  const db=env.DB;
  await ensureSchema(db);
  const read=async week=>({week_start:week,body:(await db.prepare('SELECT body FROM week_memos WHERE week_start=?').bind(week).first())?.body??''});
  if(request.method==='GET'){
    const week=new URL(request.url).searchParams.get('week');
    if(!validWeek(week))throw fail('주 정보가 올바르지 않아요.');
    return json({data:await read(week)});
  }
  if(request.method!=='POST')return json({error:'Method not allowed'},405);
  if(!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'JSON required'},415);
  const text=await request.text();
  if(text.length>MAX_BODY*2+1000)return json({error:'메모가 너무 길어요.'},413);
  let q;try{q=JSON.parse(text);}catch{throw fail('Invalid JSON');}
  if(!q||typeof q!=='object'||q.action!=='save')throw fail('Unknown action');
  if(!validWeek(q.week))throw fail('주 정보가 올바르지 않아요.');
  if(typeof q.body!=='string')throw fail('메모를 적어주세요.');
  const body=q.body.replace(/\r\n?/g,'\n');
  if(body.length>MAX_BODY)throw fail('메모는 '+MAX_BODY+'자까지 적을 수 있어요.');
  // 다 지운 메모는 저장소에서도 바로 지웁니다.
  if(!body.trim())await db.prepare('DELETE FROM week_memos WHERE week_start=?').bind(q.week).run();
  else await db.prepare('INSERT INTO week_memos(week_start,body,updated_at) VALUES(?,?,?) ON CONFLICT(week_start) DO UPDATE SET body=excluded.body,updated_at=excluded.updated_at').bind(q.week,body,new Date().toISOString()).run();
  return json({data:await read(q.week)});
}
