const json = (data, status=200) => Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const fail = message => Object.assign(new Error(message),{status:400});
const validId = id => typeof id==='string' && /^[a-zA-Z0-9-]{1,80}$/.test(id);
const COLORS = ['','red','orange','yellow','green','blue'];
const MAX_COLS = 2000, MAX_ROWS = 2000;   // row number, and position within the row
const validCell = (r,c) => Number.isInteger(r)&&Number.isInteger(c)&&r>=0&&r<MAX_ROWS&&c>=0&&c<MAX_COLS;
// A photo is uploaded as soon as it is inserted in the editor but only becomes part of a memo when the
// memo is saved. Photos that no memo refers to are removed once they are older than this grace period,
// so a photo in an editor that is still open (not yet saved) is never deleted.
const IMAGE_GRACE_MS = 24*60*60*1000;
async function removeUnusedImages(db) {
  try {
    const cutoff=new Date(Date.now()-IMAGE_GRACE_MS).toISOString();
    // Rows without a timestamp are never removed (unknown age => keep).
    // A photo is in use when a memo lists it as an attachment or (older memos) still has it in its text.
    await db.prepare('DELETE FROM memo_images WHERE created_at<? AND NOT EXISTS (SELECT 1 FROM memo_items m WHERE instr(m.content,memo_images.id)>0 OR instr(m.images,memo_images.id)>0)').bind(cutoff).run();
  } catch {
    // Cleanup is best effort and must never make saving or deleting a memo fail.
    console.error('Memo image cleanup failed');
  }
}
export async function memos(request, env, path) {
  const db=env.DB;
  if(path.startsWith('/api/private/memo-images/')) {
    if(request.method!=='GET') return json({error:'Method not allowed'},405);
    const id=path.split('/').pop();
    if(!validId(id)) throw fail('Invalid image');
    const image=await db.prepare('SELECT mime,bytes FROM memo_images WHERE id=?').bind(id).first();
    if(!image) return json({error:'Not found'},404);
    // D1 returns BLOB columns as a plain array of numbers; other drivers return ArrayBuffer/Uint8Array.
    // Passing an array straight to Response would send its text form ("137,80,78,..."), not the image.
    return new Response(new Uint8Array(image.bytes),{headers:{'Content-Type':image.mime,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
  }
  if(path==='/api/private/memo-images') {
    if(request.method!=='POST')return json({error:'Method not allowed'},405);
    const tooLarge=()=>json({error:'사진 한 장은 1MB까지 저장할 수 있어요.'},413);
    if(Number(request.headers.get('Content-Length'))>1048576) return tooLarge();
    const bytes=await request.arrayBuffer();
    if(bytes.byteLength>1048576) return tooLarge();
    const b=new Uint8Array(bytes), mime=request.headers.get('Content-Type');
    const matches=(mime==='image/png' && [137,80,78,71,13,10,26,10].every((v,i)=>b[i]===v)) ||
      (mime==='image/jpeg' && b[0]===255 && b[1]===216 && b[2]===255) ||
      (mime==='image/webp' && new TextDecoder().decode(b.slice(0,4))==='RIFF' && new TextDecoder().decode(b.slice(8,12))==='WEBP') ||
      (mime==='image/gif' && /^GIF8[79]a$/.test(new TextDecoder().decode(b.slice(0,6))));
    if(!matches)throw fail('지원하는 사진 파일이 아니에요.');
    const id=crypto.randomUUID();
    await db.prepare('INSERT INTO memo_images(id,mime,bytes,created_at) VALUES(?,?,?,?)').bind(id,mime,bytes,new Date().toISOString()).run();
    return json({url:'/api/private/memo-images/'+id});
  }
  if(request.method==='GET')return json({data:(await db.prepare('SELECT * FROM memo_items ORDER BY sort_order,id').all()).results});
  if(request.method!=='POST')return json({error:'Method not allowed'},405);
  if(!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'JSON required'},415);
  const text=await request.text();
  if(text.length>220000)return json({error:'메모가 너무 길어요.'},413);
  let q;try{q=JSON.parse(text);}catch{throw fail('Invalid JSON');}
  const now=new Date().toISOString();
  const get=async id=>validId(id) ? db.prepare('SELECT * FROM memo_items WHERE id=?').bind(id).first() : null;
  // New memos go to the end of the board (or of the folder they are created in).
  const nextOrder=async folder=>((await db.prepare('SELECT COALESCE(MAX(sort_order),0)+1 AS n FROM memo_items WHERE COALESCE(folder_id,\'\')=?').bind(folder||'').first()).n);
  if(q.action==='create') {
    const id=crypto.randomUUID();
    if(q.folder_id && (await get(q.folder_id))?.kind!=='folder')throw fail('폴더를 찾을 수 없어요.');
    // Optional grid cell [row, column] for the new memo.
    const cell=q.cell===undefined||q.cell===null?[null,null]:q.cell;
    if(cell[0]!==null&&!(Array.isArray(q.cell)&&q.cell.length===2&&validCell(cell[0],cell[1])))throw fail('Invalid cell');
    await db.prepare("INSERT INTO memo_items(id,kind,folder_id,sort_order,grid_row,grid_col,updated_at) VALUES(?,'note',?,?,?,?,?)").bind(id,q.folder_id||null,await nextOrder(q.folder_id),cell[0],cell[1],now).run();
    return json({id});
  }
  if(q.action==='layout') {
    // Cells of every memo shown together (the board, or one folder): [[id,row,column],...].
    const folder=q.folder_id||null;
    if(folder && (await get(folder))?.kind!=='folder')throw fail('폴더를 찾을 수 없어요.');
    const cells=q.cells;
    if(!Array.isArray(cells)||cells.length>2000||!cells.every(x=>Array.isArray(x)&&x.length===3&&validId(x[0])&&validCell(x[1],x[2])))throw fail('Invalid layout');
    const ids=cells.map(x=>x[0]);
    const current=(await db.prepare("SELECT id FROM memo_items WHERE COALESCE(folder_id,'')=?").bind(folder||'').all()).results.map(r=>r.id);
    if(new Set(ids).size!==ids.length||ids.length!==current.length||!current.every(id=>ids.includes(id)))throw fail('메모 목록이 바뀌었어요. 새로고침한 뒤 다시 시도해주세요.');
    if(new Set(cells.map(x=>x[1]+':'+x[2])).size!==cells.length)throw fail('Invalid layout');
    // Reading order (row, then column) is kept as sort_order for narrow screens and folder previews.
    const sorted=[...cells].sort((a,b)=>a[1]-b[1]||a[2]-b[2]);
    await db.batch(sorted.map(([id,r,c],i)=>db.prepare('UPDATE memo_items SET grid_row=?,grid_col=?,sort_order=? WHERE id=?').bind(r,c,i+1,id)));
    return json({ok:true});
  }
  if(q.action==='reorder') {
    // Only the order of the memos that are shown together (the board, or one folder) can change.
    const folder=q.folder_id||null;
    if(folder && (await get(folder))?.kind!=='folder')throw fail('폴더를 찾을 수 없어요.');
    if(!Array.isArray(q.ids)||q.ids.length>2000||!q.ids.every(validId))throw fail('Invalid order');
    const current=(await db.prepare("SELECT id FROM memo_items WHERE COALESCE(folder_id,'')=?").bind(folder||'').all()).results.map(r=>r.id);
    if(new Set(q.ids).size!==q.ids.length||q.ids.length!==current.length||!current.every(id=>q.ids.includes(id)))throw fail('메모 목록이 바뀌었어요. 새로고침한 뒤 다시 시도해주세요.');
    // Optional: the memos in this list that start a new row on the board.
    if(q.breaks!==undefined&&(!Array.isArray(q.breaks)||!q.breaks.every(id=>q.ids.includes(id))))throw fail('Invalid order');
    const breaks=new Set(q.breaks||[]);
    await db.batch(q.ids.map((id,index)=>q.breaks===undefined
      ? db.prepare('UPDATE memo_items SET sort_order=? WHERE id=?').bind(index+1,id)
      : db.prepare('UPDATE memo_items SET sort_order=?,line_break=? WHERE id=?').bind(index+1,breaks.has(id)?1:0,id)));
    return json({ok:true});
  }
  const item=await get(q.id);
  if(!item)throw fail('메모를 찾을 수 없어요.');
  if(q.action==='save') {
    if(typeof q.title!=='string'||q.title.length>120||typeof q.content!=='string'||q.content.length>200000)throw fail('메모 제목 또는 본문이 너무 길어요.');
    if(q.images===undefined) {
      await db.prepare('UPDATE memo_items SET title=?,content=?,updated_at=? WHERE id=?').bind(q.title,q.content,now,item.id).run();
    } else {
      // Attached photos: up to 60 distinct photo ids.
      if(!Array.isArray(q.images)||q.images.length>60||!q.images.every(validId)||new Set(q.images).size!==q.images.length)throw fail('첨부한 사진 목록이 올바르지 않아요.');
      await db.prepare('UPDATE memo_items SET title=?,content=?,images=?,updated_at=? WHERE id=?').bind(q.title,q.content,JSON.stringify(q.images),now,item.id).run();
    }
    // Optional paper colour and "start a new row" flag.
    if(q.color!==undefined) {
      if(!COLORS.includes(q.color))throw fail('메모지 색이 올바르지 않아요.');
      await db.prepare('UPDATE memo_items SET color=? WHERE id=?').bind(q.color,item.id).run();
    }
    if(q.line_break!==undefined) {
      if(typeof q.line_break!=='boolean')throw fail('Invalid line');
      await db.prepare('UPDATE memo_items SET line_break=? WHERE id=?').bind(q.line_break?1:0,item.id).run();
    }
  } else if(q.action==='group') {
    // Dropping a note on another note makes a named folder holding both; dropping it on a folder adds it.
    const target=await get(q.target);
    if(item.kind!=='note'||!target||target.id===item.id||item.folder_id!==target.folder_id)throw fail('Invalid grouping');
    if(target.kind==='folder') {
      await db.prepare('UPDATE memo_items SET folder_id=?,sort_order=?,grid_row=NULL,grid_col=NULL,updated_at=? WHERE id=?').bind(target.id,await nextOrder(target.id),now,item.id).run();
    } else {
      if(typeof q.title!=='string'||!q.title.trim()||q.title.length>120)throw fail('폴더 이름을 입력해주세요.');
      const id=crypto.randomUUID();
      // The new folder takes the place of the note it was dropped on; inside, the dropped-on note comes first.
      const place=target.folder_id ? await nextOrder(null) : target.sort_order;
      await db.batch([
        // The folder also takes the dropped-on note's grid cell.
        db.prepare("INSERT INTO memo_items(id,kind,title,sort_order,grid_row,grid_col,updated_at) VALUES(?,'folder',?,?,?,?,?)").bind(id,q.title.trim(),place,target.folder_id?null:target.grid_row,target.folder_id?null:target.grid_col,now),
        db.prepare('UPDATE memo_items SET folder_id=?,sort_order=1,grid_row=NULL,grid_col=NULL,updated_at=? WHERE id=?').bind(id,now,target.id),
        db.prepare('UPDATE memo_items SET folder_id=?,sort_order=2,grid_row=NULL,grid_col=NULL,updated_at=? WHERE id=?').bind(id,now,item.id)
      ]);
    }
  } else if(q.action==='unfold') {
    // Take a memo out of its folder; it goes to the end of the board.
    if(!item.folder_id)throw fail('Invalid folder');
    await db.prepare('UPDATE memo_items SET folder_id=NULL,sort_order=?,grid_row=NULL,grid_col=NULL,updated_at=? WHERE id=?').bind(await nextOrder(null),now,item.id).run();
  } else if(q.action==='delete') {
    await db.batch([
      // Memos of a dissolved folder move to the end of the board and keep their order.
      db.prepare("UPDATE memo_items SET sort_order=sort_order+(SELECT COALESCE(MAX(sort_order),0) FROM memo_items WHERE folder_id IS NULL),folder_id=NULL,grid_row=NULL,grid_col=NULL WHERE folder_id=?").bind(item.id),
      db.prepare('DELETE FROM memo_items WHERE id=?').bind(item.id)
    ]);
  } else throw fail('Unknown action');
  // Photos can only become unused when a memo's content changes or a memo is deleted.
  if(q.action==='save'||q.action==='delete') await removeUnusedImages(db);
  return json({ok:true});
}
