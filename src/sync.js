// 실시간 동기화 (관리자 전용). 일정·할 일·기록·메모가 저장될 때마다 변경 번호가 1씩 올라가고,
// 웹 화면과 데스크톱 위젯이 이 번호를 몇 초마다 확인해서 바뀌었으면 화면을 새로 불러옵니다.
// 번호만 다루며 일정·메모 내용은 오가지 않습니다.
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
// migrations/0010_sync_state.sql 과 같은 내용입니다 (tests/sync.test.mjs 가 서로 같은지 확인해요).
// 배포 과정에서 마이그레이션이 빠져도 동작하도록, 처음 쓸 때 한 번 없으면 만들어둡니다.
export const SCHEMA=[
  'CREATE TABLE IF NOT EXISTS sync_state (id INTEGER PRIMARY KEY CHECK (id = 1), version INTEGER NOT NULL, updated_at TEXT NOT NULL)',
  "INSERT OR IGNORE INTO sync_state (id, version, updated_at) VALUES (1, 0, '')"
];
const ready=new WeakMap();
const ensureSchema=db=>{
  if(!ready.has(db))ready.set(db,(async()=>{for(const sql of SCHEMA)await db.prepare(sql).run();})().catch(error=>{ready.delete(db);throw error;}));
  return ready.get(db);
};
export async function readVersion(db){
  await ensureSchema(db);
  const row=await db.prepare('SELECT version FROM sync_state WHERE id=1').first();
  return Number(row?.version)||0;
}
// 저장이 끝난 뒤 변경 번호를 올리고 새 번호를 돌려줍니다. 실패해도 저장 자체는 성공으로 두기 위해 null 을 돌려줍니다.
export async function bumpVersion(db){
  try {
    await ensureSchema(db);
    const result=await db.prepare('UPDATE sync_state SET version=version+1,updated_at=? WHERE id=1 RETURNING version').bind(new Date().toISOString()).all();
    return Number(result.results?.[0]?.version)||null;
  } catch {
    console.error('Sync version update failed');
    return null;
  }
}
// 저장 응답에 새 변경 번호를 실어 보냅니다. 저장한 화면은 자기 저장 때문에 번호가 올라간 것을 알아보고 다시 불러오지 않습니다.
export function withVersion(response,version){
  if(!version)return response;
  const copy=new Response(response.body,response);
  copy.headers.set('X-Sync-Version',String(version));
  return copy;
}
export async function sync(request,env){
  if(request.method!=='GET')return json({error:'Method not allowed'},405);
  return json({data:{version:await readVersion(env.DB)}});
}
