const json = (data, status=200) => Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const fail = message => Object.assign(new Error(message),{status:400});
const validId = id => typeof id==='string' && /^[a-zA-Z0-9-]{1,80}$/.test(id);
export async function memos(request, env, path) {
  const db=env.DB;
  if(path.startsWith('/api/private/memo-images/')) {
    if(request.method!=='GET') return json({error:'Method not allowed'},405);
    const id=path.split('/').pop();
    if(!validId(id)) throw fail('Invalid image');
    const image=await db.prepare('SELECT mime,bytes FROM memo_images WHERE id=?').bind(id).first();
    if(!image) return json({error:'Not found'},404);
    return new Response(image.bytes,{headers:{'Content-Type':image.mime,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
  }
  if(path==='/api/private/memo-images') {
    if(request.method!=='POST')return json({error:'Method not allowed'},405);
    const bytes=await request.arrayBuffer();
    if(bytes.byteLength>1048576) return json({error:'사진 한 장은 1MB까지 저장할 수 있어요.'},413);
    const b=new Uint8Array(bytes), mime=request.headers.get('Content-Type');
    const matches=(mime==='image/png' && [137,80,78,71,13,10,26,10].every((v,i)=>b[i]===v)) ||
      (mime==='image/jpeg' && b[0]===255 && b[1]===216 && b[2]===255) ||
      (mime==='image/webp' && new TextDecoder().decode(b.slice(0,4))==='RIFF' && new TextDecoder().decode(b.slice(8,12))==='WEBP') ||
      (mime==='image/gif' && /^GIF8[79]a$/.test(new TextDecoder().decode(b.slice(0,6))));
    if(!matches)throw fail('지원하는 사진 파일이 아니에요.');
    const id=crypto.randomUUID();
    await db.prepare('INSERT INTO memo_images(id,mime,bytes) VALUES(?,?,?)').bind(id,mime,bytes).run();
    return json({url:'/api/private/memo-images/'+id});
  }
  if(request.method==='GET')return json({data:(await db.prepare('SELECT * FROM memo_items ORDER BY updated_at,id').all()).results});
  if(request.method!=='POST')return json({error:'Method not allowed'},405);
  if(!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'JSON required'},415);
  const text=await request.text();
  if(text.length>220000)return json({error:'메모가 너무 길어요.'},413);
  let q;try{q=JSON.parse(text);}catch{throw fail('Invalid JSON');}
  const now=new Date().toISOString();
  const get=async id=>validId(id) ? db.prepare('SELECT * FROM memo_items WHERE id=?').bind(id).first() : null;
  if(q.action==='create') {
    const id=crypto.randomUUID();
    if(q.folder_id && (await get(q.folder_id))?.kind!=='folder')throw fail('폴더를 찾을 수 없어요.');
    const x=Number(q.x), y=Number(q.y);
    if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||y<0||x>10000||y>100000)throw fail('Invalid position');
    await db.prepare("INSERT INTO memo_items(id,kind,folder_id,x,y,updated_at) VALUES(?,'note',?,?,?,?)").bind(id,q.folder_id||null,x,y,now).run();
    return json({id});
  }
  const item=await get(q.id);
  if(!item)throw fail('메모를 찾을 수 없어요.');
  if(q.action==='save') {
    if(typeof q.title!=='string'||q.title.length>120||typeof q.content!=='string'||q.content.length>200000)throw fail('메모 제목 또는 본문이 너무 길어요.');
    await db.prepare('UPDATE memo_items SET title=?,content=?,updated_at=? WHERE id=?').bind(q.title,q.content,now,item.id).run();
  } else if(q.action==='move') {
    if(!Number.isFinite(q.x)||!Number.isFinite(q.y)||q.x<0||q.y<0||q.x>10000||q.y>100000)throw fail('Invalid position');
    if(q.folder_id && (item.kind==='folder'||(await get(q.folder_id))?.kind!=='folder'))throw fail('Invalid folder');
    await db.prepare('UPDATE memo_items SET x=?,y=?,folder_id=?,updated_at=? WHERE id=?').bind(q.x,q.y,q.folder_id||null,now,item.id).run();
  } else if(q.action==='group') {
    const target=await get(q.target);
    if(item.kind!=='note'||!target||target.id===item.id||item.folder_id!==target.folder_id)throw fail('Invalid grouping');
    if(target.kind==='folder') {
      await db.prepare('UPDATE memo_items SET folder_id=?,updated_at=? WHERE id=?').bind(target.id,now,item.id).run();
    } else {
      if(typeof q.title!=='string'||!q.title.trim()||q.title.length>120)throw fail('폴더 이름을 입력해주세요.');
      const id=crypto.randomUUID();
      await db.batch([
        db.prepare("INSERT INTO memo_items(id,kind,title,x,y,updated_at) VALUES(?,'folder',?,?,?,?)").bind(id,q.title.trim(),target.x,target.y,now),
        db.prepare('UPDATE memo_items SET folder_id=?,updated_at=? WHERE id IN (?,?)').bind(id,now,item.id,target.id)
      ]);
    }
  } else if(q.action==='delete') {
    await db.batch([
      db.prepare('UPDATE memo_items SET folder_id=NULL WHERE folder_id=?').bind(item.id),
      db.prepare('DELETE FROM memo_items WHERE id=?').bind(item.id)
    ]);
  } else throw fail('Unknown action');
  return json({ok:true});
}
