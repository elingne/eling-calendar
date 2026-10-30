/* Private memo board. Memos are edited right on their cards and saved automatically.
   Photos are attachments shown only in a memo's full view. Images use authenticated endpoints. */
(() => {
  const byId=id=>document.getElementById(id);
  const board=byId('memoBoard'), modal=byId('memoModal'), viewEditor=byId('memoEditor'), viewTitle=byId('memoTitle');
  const gallery=byId('memoGallery'), lightbox=byId('memoLightbox');
  let items=[], folderId=null, busy=false, uploading=0, suppressClick=0, viewing=null, returnFocus=null;
  const SAVE_DELAY=700, MAX_IMAGES=60;
  const COLORS=['','red','orange','yellow','green','blue'];
  const COLOR_NAMES={'':'흰색',red:'빨강',orange:'주황',yellow:'노랑',green:'초록',blue:'파랑'};
  // A memo with line_break starts a new row on the board even if the row above is not full.
  function applyLayout(card,item){
    if(item.color)card.dataset.color=item.color;else delete card.dataset.color;

  }
  const IMAGE_URL=/^\/api\/private\/memo-images\/([a-zA-Z0-9-]{1,80})$/;
  const status=text=>{byId('memoStatus').textContent=text;if(viewing)byId('memoEditorStatus').textContent=text;};
  // fetch rejects when offline or when the Access session expired (redirect:'error').
  const send=(url,options)=>fetch(url,options).catch(()=>{throw Error('연결에 실패했어요. 로그인이 만료됐다면 새로고침해서 다시 로그인해주세요.');});
  async function api(body) {
    const json=body&&JSON.stringify(body);
    // keepalive lets a save finish even when the page is being closed.
    const response=await send('/api/private/memos',body?{method:'POST',headers:{'Content-Type':'application/json'},body:json,redirect:'error',keepalive:json.length<60000}:{cache:'no-store',redirect:'error'});
    let result;try{result=await response.json();}catch{throw Error('로그인을 확인한 뒤 다시 시도해주세요.');}
    if(!response.ok)throw Error(result.error?.message||result.error||'저장에 실패했어요. 다시 시도해주세요.');
    return result;
  }
  async function attempt(task) {try{await task();}catch(error){status(error.message);}}

  // ---- Content: a tiny safe HTML subset, text only (photos are attachments) ----
  function safeContent(html) {
    const template=document.createElement('template');template.innerHTML=html||'';
    const fragment=document.createDocumentFragment();
    const allowed=new Set(['DIV','P','BR','B','STRONG','I','EM','U','UL','OL','LI','BLOCKQUOTE']);
    const copy=(node,parent)=>{
      if(node.nodeType===3){parent.appendChild(document.createTextNode(node.textContent));return;}
      if(node.nodeType!==1)return;
      if(['SCRIPT','STYLE','IFRAME','OBJECT','SVG','IMG'].includes(node.tagName))return;
      const target=allowed.has(node.tagName)?document.createElement(node.tagName.toLowerCase()):parent;
      if(target!==parent)parent.appendChild(target);
      for(const child of node.childNodes)copy(child,target);
    };
    for(const node of template.content.childNodes)copy(node,fragment);
    return fragment;
  }
  const cleanHTML=html=>{const div=document.createElement('div');div.appendChild(safeContent(html));return div.innerHTML;};
  const plainText=html=>{const div=document.createElement('div');div.appendChild(safeContent(html));return div.textContent;};
  // Photo ids of a memo: its attachment list plus photos still inside the text of older memos.
  function imagesOf(item){
    let list=[];try{list=JSON.parse(item.images||'[]');}catch{}
    const template=document.createElement('template');template.innerHTML=item.content||'';
    for(const img of template.content.querySelectorAll('img'))list.push(IMAGE_URL.exec(img.getAttribute('src')||'')?.[1]);
    return [...new Set(list.filter(id=>typeof id==='string'&&/^[a-zA-Z0-9-]{1,80}$/.test(id)))];
  }
  const isEmpty=item=>!item.title.trim()&&!plainText(item.content).trim()&&!item.imageList.length;

  // ---- Automatic saving ----
  const timers=new Map();
  function queueSave(item,delay=SAVE_DELAY){
    clearTimeout(timers.get(item));
    timers.set(item,setTimeout(()=>saveNow(item),delay));
    status('저장 중…');
  }
  function saveNow(item){
    clearTimeout(timers.get(item));timers.delete(item);
    if(item.saving){item.again=true;return item.saving;}
    item.saving=(async()=>{
      try{
        if(!item.id){
          if(isEmpty(item)){status('');return;}            // an empty new memo is never stored
          item.id=(await api({action:'create',folder_id:item.folder_id}))?.id;
          // Store every row so the new memo stays in the row it was written in.
          if((item.folder_id||null)===folderId&&rowsNow.some(r=>r.includes(item))){
            await Promise.all([...pendingDeletes].map(commitDelete));
            const rows=rowsNow.map(r=>r.filter(i=>i.id&&items.includes(i))).filter(r=>r.length);
            await api({action:'layout',folder_id:folderId,cells:rows.flatMap((r,ri)=>r.map((i,ci)=>[i.id,ri,ci]))});
            rows.forEach((r,ri)=>r.forEach((i,ci)=>{i.grid_row=ri;i.grid_col=ci;}));
          }
          const card=board.querySelector('.memo-card[data-draft]');
          if(card){
            card.dataset.memoId=item.id;card.removeAttribute('data-draft');
            const handle=card.querySelector('.memo-drag-handle');handle.disabled=false;enableReorder(handle,card,item);
          }
        }
        item.content=cleanHTML(item.content);   // text only; photos live in the attachment list
        await api({action:'save',id:item.id,title:item.title,content:item.content,images:item.imageList,color:item.color||''});
        item.images=JSON.stringify(item.imageList);
        status('저장했어요');
      }catch(error){status(error.message);}
      finally{item.saving=null;if(item.again){item.again=false;saveNow(item);}}
    })();
    return item.saving;
  }
  const flushAll=()=>Promise.all([...timers.keys()].map(saveNow).concat(items.filter(i=>i.saving).map(i=>i.saving),[...pendingDeletes].map(commitDelete)));
  // Deleting is immediate on screen; the memo is removed from the database a few seconds later so the
  // last deletion can be undone. Anything that changes the board on the server commits it first.
  const pendingDeletes=new Set();
  function deleteMemo(item){
    clearTimeout(timers.get(item));timers.delete(item);
    const index=items.indexOf(item);if(index<0)return;
    items.splice(index,1);
    if(viewing===item){viewing=null;modal.classList.add('hidden');document.body.classList.remove('memo-editing');hideLarge();}
    render();
    if(!item.id&&!item.saving){status('');return;}                  // a draft was never stored
    const entry={item,index,timer:setTimeout(()=>commitDelete(entry),6000)};
    pendingDeletes.add(entry);
    const box=byId('memoStatus');box.textContent='메모를 삭제했어요. ';
    const undo=document.createElement('button');undo.type='button';undo.className='memo-undo-button';undo.textContent='되돌리기';
    undo.addEventListener('click',event=>{
      event.stopPropagation();if(!pendingDeletes.has(entry))return;
      clearTimeout(entry.timer);pendingDeletes.delete(entry);
      items.splice(Math.min(entry.index,items.length),0,item);render();status('삭제를 되돌렸어요.');
    });
    box.appendChild(undo);
  }
  async function commitDelete(entry){
    if(!pendingDeletes.has(entry))return;
    pendingDeletes.delete(entry);clearTimeout(entry.timer);
    try{
      await entry.item.saving;                                       // a first save may still be creating it
      if(entry.item.id)await api({action:'delete',id:entry.item.id});
      if(byId('memoStatus').querySelector('.memo-undo-button')&&!pendingDeletes.size)status('');
    }catch(error){status(error.message);}
  }
  function setItems(rows){
    items=rows.map(row=>({...row,title:row.title||'',content:row.content||'',color:COLORS.includes(row.color)?row.color:'',line_break:!!row.line_break,grid_row:Number.isInteger(row.grid_row)?row.grid_row:null,grid_col:Number.isInteger(row.grid_col)?row.grid_col:null,imageList:row.kind==='note'?imagesOf(row):[]}));
  }
  window.loadMemoBoard=async()=>{
    if(!isOwner)return;
    try{await flushAll();setItems((await api()).data);render();status('');}catch(error){status(error.message);}
  };

  function button(text,action,cls='memo-small-button') {
    const b=document.createElement('button');b.type='button';b.textContent=text;b.className=cls;
    b.addEventListener('click',event=>{event.stopPropagation();attempt(action);});return b;
  }
  // Insert pasted/dropped text as plain text at the caret.
  function insertText(text){
    if(document.execCommand?.('insertText',false,text))return;
    const s=window.getSelection();if(!s.rangeCount)return;
    const r=s.getRangeAt(0);r.deleteContents();const node=document.createTextNode(text);r.insertNode(node);r.setStartAfter(node);r.collapse(true);s.removeAllRanges();s.addRange(r);
  }
  // Text editing shared by the card body and the full view.
  // getItem() names the memo the editor belongs to (the card's memo, or the one open in full view).
  function wireTextEditor(el,getItem){
    el.addEventListener('input',()=>{const item=getItem();if(!item)return;item.content=cleanHTML(el.innerHTML);queueSave(item);});
    el.addEventListener('paste',event=>{
      event.preventDefault();
      const files=[...(event.clipboardData?.files||[])].filter(f=>f.type.startsWith('image/'));
      if(files.length){attachImages(getItem(),files);return;}
      insertText(event.clipboardData?.getData('text/plain')||'');
    });
    el.addEventListener('dragover',event=>{event.preventDefault();});
    el.addEventListener('drop',event=>{
      event.preventDefault();
      const files=[...(event.dataTransfer?.files||[])].filter(f=>f.type.startsWith('image/'));
      if(files.length){attachImages(getItem(),files);return;}
      const text=event.dataTransfer?.getData('text/plain');if(text)insertText(text);
    });
  }

  // ---- Board: independent rows. Each row holds its memos packed from the left, as many as wanted;
  // a row does not have to be full before the next one is used. ----
  let rowsNow=[];   // rows of items, as shown
  const visibleItems=()=>items.filter(i=>(i.folder_id||null)===folderId);
  const hasCell=i=>Number.isInteger(i.grid_row)&&Number.isInteger(i.grid_col);
  function computeRows(){
    const list=visibleItems(),saved=list.filter(i=>i.id),out=[];
    if(saved.some(hasCell)){
      // Stored rows; memos without one (e.g. just taken out of a folder) join the last row.
      const stored=saved.filter(hasCell).sort((a,b)=>a.grid_row-b.grid_row||a.grid_col-b.grid_col);
      let last=null;for(const i of stored){if(i.grid_row!==last){out.push([]);last=i.grid_row;}out[out.length-1].push(i);}
      const rest=saved.filter(i=>!hasCell(i));if(rest.length){if(!out.length)out.push([]);out[out.length-1].push(...rest);}
    }else{
      // Nothing stored yet: keep the order and the old "new row" marks.
      for(const i of saved){if(!out.length||(i.line_break&&out[out.length-1].length))out.push([]);out[out.length-1].push(i);}
    }
    for(const d of list.filter(i=>!i.id)){   // a new memo goes at the end of its row (or a new row)
      const r=Number.isInteger(d.grid_row)?d.grid_row:Math.max(0,out.length-1);
      while(out.length<=r)out.push([]);out[r].push(d);
    }
    return rowsNow=out.filter(r=>r.length);
  }
  function render() {
    if(folderId&&!items.some(i=>i.id===folderId&&i.kind==='folder'))folderId=null;
    board.innerHTML='';
    byId('memoBack').classList.toggle('hidden',!folderId);
    byId('memoFolderTitle').textContent=folderId?items.find(i=>i.id===folderId)?.title:'';
    const rows=computeRows();
    if(!rows.length){const hint=document.createElement('span');hint.className='memo-empty-hint';hint.textContent='빈 곳을 누르거나 + 메모를 눌러 메모를 추가하세요';board.appendChild(hint);}
    rows.forEach((row,r)=>{
      const el=document.createElement('div');el.className='memo-row';el.dataset.row=r;
      for(const item of row)el.appendChild(item.kind==='folder'?folderCard(item):noteCard(item));
      board.appendChild(el);
    });
    // Below the last row: drop or click here to start a new row.
    const tail=document.createElement('div');tail.className='memo-row-new';tail.dataset.row=rows.length;
    tail.textContent=rows.length?'여기에 놓거나 누르면 새 줄':'';board.appendChild(tail);
  }
  // Store the rows (empty rows disappear).
  async function saveRows(rows){
    busy=true;
    try{
      await flushAll();
      const clean=rows.map(r=>r.filter(i=>i.id&&items.includes(i))).filter(r=>r.length);
      await api({action:'layout',folder_id:folderId,cells:clean.flatMap((r,ri)=>r.map((i,ci)=>[i.id,ri,ci]))});
      clean.forEach((r,ri)=>r.forEach((i,ci)=>{i.grid_row=ri;i.grid_col=ci;}));
      await window.loadMemoBoard();
    }catch(error){status(error.message);render();}finally{busy=false;}
  }
  const rowsWithout=item=>rowsNow.map(r=>r.filter(i=>i!==item));
  const rowOf=item=>rowsNow.findIndex(r=>r.includes(item));
  function noteCard(item){
    const card=document.createElement('article');card.className='memo-card';
    if(item.id)card.dataset.memoId=item.id;else card.dataset.draft='';
    const header=document.createElement('div');header.className='memo-card-header';
    const handle=button('⠿',()=>{},'memo-drag-handle');handle.setAttribute('aria-label','메모 순서 바꾸기 또는 폴더로 묶기');handle.title='끌어서 순서를 바꾸거나 다른 메모 위에 놓아 폴더로 묶으세요 (키보드: 방향키)';
    const title=document.createElement('input');title.type='text';title.className='memo-card-title-input';title.maxLength=120;title.placeholder='제목';title.value=item.title;title.setAttribute('aria-label','메모 제목');
    title.addEventListener('input',()=>{item.title=title.value;queueSave(item);});
    title.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();body.focus();}});
    const open=button('⤢',()=>openView(item),'memo-icon-button memo-open-button');open.title='전체보기 · 첨부한 사진 보기';open.setAttribute('aria-label','전체보기');
    const remove=button('×',()=>deleteMemo(item),'memo-icon-button memo-delete-button');remove.title='메모 삭제';remove.setAttribute('aria-label','메모 삭제');
    header.append(handle,title,open,remove);
    const body=document.createElement('div');body.className='memo-body';body.setAttribute('contenteditable','true');
    body.setAttribute('role','textbox');body.setAttribute('aria-multiline','true');body.setAttribute('aria-label','메모 내용');body.dataset.placeholder='내용을 입력하세요';
    body.appendChild(safeContent(item.content));
    wireTextEditor(body,()=>item);
    const actions=document.createElement('div');actions.className='memo-card-actions';
    if(item.imageList.length){const photos=button('사진 '+item.imageList.length+'장',()=>openView(item),'memo-small-button memo-photo-count');actions.appendChild(photos);}
    if(folderId&&item.id)actions.appendChild(button('폴더 밖으로',async()=>{await flushAll();await api({action:'unfold',id:item.id});await window.loadMemoBoard();}));
    card.append(header,body,actions);applyLayout(card,item);
    // Leaving a card: an untouched new memo disappears; anything typed is saved right away.
    // The first click outside a card only ends editing, it does not add another memo.
    card.addEventListener('focusout',event=>{
      if(card.contains(event.relatedTarget)||viewing===item)return;
      // Only leaving the text (not the handle or a button) swallows the next click.
      if(event.target.matches?.('input,[contenteditable="true"]'))suppressClick=Date.now()+350;
      if(!item.id&&isEmpty(item)){removeDraft(item);return;}
      if(timers.has(item))saveNow(item);
    });
    if(item.id)enableReorder(handle,card,item);else handle.disabled=true;
    return card;
  }
  function folderCard(item){
    const card=document.createElement('article');card.className='memo-card memo-folder';card.dataset.memoId=item.id;
    const header=document.createElement('div');header.className='memo-card-header';
    const handle=button('⠿',()=>{},'memo-drag-handle');handle.setAttribute('aria-label','폴더 순서 바꾸기');handle.title='끌어서 순서를 바꾸세요 (키보드: 방향키)';
    const title=button('📁 '+(item.title||'폴더'),()=>openFolder(item),'memo-card-title');
    header.append(handle,title);
    const preview=document.createElement('div');preview.className='memo-preview';
    const children=items.filter(i=>i.folder_id===item.id);
    preview.textContent=children.length+'개의 메모';
    for(const child of children.slice(0,6)){const p=document.createElement('p');p.textContent=child.title||plainText(child.content).slice(0,60)||'빈 메모';preview.appendChild(p);}
    preview.addEventListener('click',event=>{event.stopPropagation();if(Date.now()<suppressClick)return;openFolder(item);});
    const actions=document.createElement('div');actions.className='memo-card-actions';
    actions.appendChild(button('이름 바꾸기',async()=>{
      const name=window.prompt('폴더 이름',item.title);if(name===null||!name.trim())return;
      await api({action:'save',id:item.id,title:name.trim(),content:''});await window.loadMemoBoard();
    }));
    actions.appendChild(button('폴더 풀기',async()=>{await flushAll();await api({action:'delete',id:item.id});await window.loadMemoBoard();}));
    card.append(header,preview,actions);applyLayout(card,item);enableReorder(handle,card,item);
    return card;
  }
  function removeDraft(item){
    items=items.filter(i=>i!==item);
    board.querySelector('.memo-card[data-draft]')?.remove();
    if(!items.some(i=>(i.folder_id||null)===folderId))render();
  }
  function openFolder(item){folderId=item.id;render();}
  byId('memoBack').addEventListener('click',()=>{folderId=null;render();});
  // New memo: an empty card at the end, ready for typing. It is stored once something is written.
  function create(row=null){
    if(!isOwner||busy)return;
    let draft=items.find(i=>!i.id&&(i.folder_id||null)===folderId);
    if(!draft){draft={id:null,kind:'note',title:'',content:'',images:'[]',imageList:[],color:'',line_break:false,grid_row:null,grid_col:null,folder_id:folderId};items.push(draft);}
    draft.grid_row=row;draft.grid_col=row===null?null:9999;
    render();
    const card=board.querySelector('.memo-card[data-draft]');
    card?.scrollIntoView?.({block:'nearest'});card?.querySelector('.memo-body')?.focus();
  }
  byId('newMemoButton').addEventListener('click',()=>create());
  // Clicking any empty part of the memo tab (not a card, button, field or text) adds a memo.
  byId('memosPage').addEventListener('click',event=>{
    if(Date.now()<suppressClick||busy)return;
    if(event.target.closest('.memo-card,button,a,input,textarea,select,label,[contenteditable="true"],h1,h2,p,.section-label,#memoStatus'))return;
    if(String(window.getSelection?.()||''))return;
    // Empty space in a row: the new memo goes at the end of that row. Below the last row: a new row.
    const row=event.target.closest('.memo-row,.memo-row-new');
    if(row)create(Number(row.dataset.row));
    else if(board.contains(event.target)||event.target===board)create(rowsNow.length);
    else create();
  });

  // ---- Moving memos and making folders (drag the ⠿ handle) ----
  function enableReorder(handle,card,item){
    // Keyboard: ←/→ move within the row, ↑/↓ move to the end of the row above/below.
    handle.addEventListener('keydown',event=>{
      const key=event.key;if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(key)||busy)return;
      event.preventDefault();event.stopPropagation();
      const r=rowOf(item),rows=rowsNow.map(x=>[...x]),i=rows[r].indexOf(item);
      if(key==='ArrowLeft'||key==='ArrowRight'){
        const j=i+(key==='ArrowLeft'?-1:1);if(j<0||j>=rows[r].length)return;
        [rows[r][i],rows[r][j]]=[rows[r][j],rows[r][i]];
      }else{
        const t=r+(key==='ArrowUp'?-1:1);
        if(t<0||(t>=rows.length&&rows[r].length===1))return;
        rows[r].splice(i,1);if(t>=rows.length)rows.push([]);rows[t].push(item);
      }
      saveRows(rows).then(()=>board.querySelector(`[data-memo-id="${item.id}"] .memo-drag-handle`)?.focus());
    });
    handle.addEventListener('pointerdown',event=>{
      if(event.button!==0||busy)return;
      const startX=event.clientX,startY=event.clientY,startScroll=window.scrollY;
      let moved=false,hit=null;   // {el,zone:'before'|'after'|'group'} | {zone:'rowend',row} | {zone:'newrow',at}
      handle.setPointerCapture?.(event.pointerId);
      const cards=()=>[...board.querySelectorAll('.memo-card[data-memo-id]')].filter(el=>el!==card);
      const marks='memo-drop-target memo-drop-before memo-drop-after memo-row-target memo-row-insert memo-row-new-target'.split(' ');
      const clear=()=>board.querySelectorAll('.'+marks.join(',.')).forEach(el=>el.classList.remove(...marks));
      const inside=(b,e)=>e.clientX>=b.left&&e.clientX<=b.right&&e.clientY>=b.top&&e.clientY<=b.bottom;
      const move=e=>{
        if(Math.hypot(e.clientX-startX,e.clientY-startY)<7&&!moved)return;
        moved=true;card.classList.add('memo-dragging');
        // Near the top/bottom of the screen the page scrolls, so long boards can be rearranged on a phone.
        if(e.clientY<70)window.scrollBy?.(0,-16);else if(e.clientY>window.innerHeight-70)window.scrollBy?.(0,16);
        card.style.transform=`translate(${e.clientX-startX}px,${e.clientY-startY+window.scrollY-startScroll}px)`;
        clear();hit=null;
        const el=cards().find(c=>inside(c.getBoundingClientRect(),e));
        if(el){
          const b=el.getBoundingClientRect(),ratio=(e.clientX-b.left)/b.width;
          // Left/right edge = just before/after that memo in its row; the middle = make a folder.
          const zone=ratio<.28?'before':ratio>.72?'after':item.kind==='note'?'group':(ratio<.5?'before':'after');
          hit={el,zone};el.classList.add(zone==='group'?'memo-drop-target':'memo-drop-'+zone);
          return;
        }
        const rowEls=[...board.querySelectorAll('.memo-row')];
        const rowEl=rowEls.find(r=>inside(r.getBoundingClientRect(),e));
        if(rowEl){hit={zone:'rowend',row:Number(rowEl.dataset.row)};rowEl.classList.add('memo-row-target');return;}   // empty part of a row
        const tail=board.querySelector('.memo-row-new');
        if(tail&&e.clientY>=tail.getBoundingClientRect().top-9){hit={zone:'newrow',at:rowEls.length};tail.classList.add('memo-row-new-target');return;}
        // Between two rows: a new row there.
        const k=rowEls.findIndex(r=>e.clientY<r.getBoundingClientRect().top);
        if(k>0&&e.clientY>rowEls[k-1].getBoundingClientRect().bottom){hit={zone:'newrow',at:k};rowEls[k].classList.add('memo-row-insert');}
      };
      const stop=()=>{handle.removeEventListener('pointermove',move);handle.removeEventListener('pointerup',finish);handle.removeEventListener('pointercancel',cancel);card.classList.remove('memo-dragging');card.style.transform='';clear();};
      const finish=async()=>{
        const drop=hit;stop();if(!moved)return;suppressClick=Date.now()+450;
        if(!drop)return;
        if(drop.zone==='group'){
          const other=items.find(i=>i.id===drop.el.dataset.memoId);if(!other)return;
          busy=true;
          try{
            await flushAll();
            const name=other.kind==='folder'?other.title:window.prompt('새 폴더 이름','새 폴더');
            if(name!==null&&name.trim())await api({action:'group',id:item.id,target:other.id,title:name.trim()});
            await window.loadMemoBoard();
          }catch(error){status(error.message);render();}finally{busy=false;}
          return;
        }
        const rows=rowsWithout(item);
        if(drop.zone==='rowend')rows[drop.row].push(item);
        else if(drop.zone==='newrow')rows.splice(drop.at,0,[item]);
        else{
          const other=items.find(i=>i.id===drop.el.dataset.memoId);if(!other)return;
          const r=rows.findIndex(x=>x.includes(other));
          rows[r].splice(rows[r].indexOf(other)+(drop.zone==='after'?1:0),0,item);
        }
        const before=rowsNow.map(r=>r.map(i=>i.id).join()).join('|');
        if(rows.filter(r=>r.length).map(r=>r.map(i=>i.id).join()).join('|')!==before)saveRows(rows);
      };
      const cancel=()=>{stop();suppressClick=Date.now()+450;};
      handle.addEventListener('pointermove',move);handle.addEventListener('pointerup',finish);handle.addEventListener('pointercancel',cancel);
    });
  }

  // ---- Full view: large editor plus all attached photos ----
  viewTitle.addEventListener('input',()=>{if(!viewing)return;viewing.title=viewTitle.value;queueSave(viewing);});
  wireTextEditor(viewEditor,()=>viewing);
  function openView(item){
    viewing=item;returnFocus=document.activeElement;
    viewTitle.value=item.title;viewEditor.innerHTML='';viewEditor.appendChild(safeContent(item.content));
    byId('memoEditorStatus').textContent='';
    renderGallery();renderViewLayout();
    modal.classList.remove('hidden');document.body.classList.add('memo-editing');
    viewEditor.focus();
  }
  function renderViewLayout(){
    const item=viewing;if(!item)return;
    const box=modal.querySelector('.memo-modal');
    if(item.color)box.dataset.color=item.color;else delete box.dataset.color;
    for(const b of modal.querySelectorAll('[data-memo-color]'))b.setAttribute('aria-pressed',String(b.dataset.memoColor===(item.color||'')));
  }
  for(const b of modal.querySelectorAll('[data-memo-color]')){
    b.title=COLOR_NAMES[b.dataset.memoColor];b.setAttribute('aria-label','메모지 색: '+COLOR_NAMES[b.dataset.memoColor]);
    b.addEventListener('click',()=>{if(!viewing)return;viewing.color=b.dataset.memoColor;renderViewLayout();if(viewing.id||!isEmpty(viewing))saveNow(viewing);});
  }
  function renderGallery(){
    const item=viewing;gallery.innerHTML='';
    byId('memoImageCount').textContent=item.imageList.length?item.imageList.length+'장':'';
    byId('memoGalleryEmpty').classList.toggle('hidden',item.imageList.length>0);
    for(const id of item.imageList){
      const figure=document.createElement('figure');figure.className='memo-gallery-item';
      const open=document.createElement('button');open.type='button';open.className='memo-gallery-open';open.setAttribute('aria-label','사진 크게 보기');
      const img=document.createElement('img');img.src='/api/private/memo-images/'+id;img.alt='첨부한 사진';img.loading='lazy';
      open.appendChild(img);open.addEventListener('click',()=>showLarge(img.src));
      const remove=document.createElement('button');remove.type='button';remove.className='memo-gallery-remove';remove.textContent='×';remove.setAttribute('aria-label','이 사진 빼기');
      remove.addEventListener('click',()=>{
        item.imageList=item.imageList.filter(x=>x!==id);renderGallery();saveNow(item);
        (gallery.querySelector('.memo-gallery-open')||byId('memoPhotoButton')).focus();
      });
      figure.append(open,remove);gallery.appendChild(figure);
    }
  }
  function showLarge(src){largeFrom=document.activeElement;byId('memoLightboxImg').src=src;lightbox.classList.remove('hidden');byId('memoLightboxClose').focus();}
  let largeFrom=null;
  function hideLarge(){
    if(lightbox.classList.contains('hidden'))return;
    lightbox.classList.add('hidden');byId('memoLightboxImg').removeAttribute('src');
    if(largeFrom?.isConnected)largeFrom.focus();largeFrom=null;
  }
  byId('memoLightboxClose').addEventListener('click',hideLarge);
  lightbox.addEventListener('click',event=>{if(event.target===lightbox)hideLarge();});
  lightbox.addEventListener('keydown',event=>{if(event.key==='Tab'){event.preventDefault();byId('memoLightboxClose').focus();}});
  async function closeView(){
    if(!viewing||uploading)return;
    const item=viewing;viewing=null;
    modal.classList.add('hidden');document.body.classList.remove('memo-editing');hideLarge();
    if(!item.id&&isEmpty(item))items=items.filter(i=>i!==item);
    render();
    const card=item.id?board.querySelector(`.memo-card[data-memo-id="${item.id}"] .memo-open-button`):null;
    (card||returnFocus)?.isConnected&&(card||returnFocus).focus();
    if(items.includes(item))await saveNow(item);
  }
  byId('memoClose').addEventListener('click',()=>closeView());
  modal.addEventListener('click',event=>{if(event.target===modal)closeView();});
  modal.addEventListener('keydown',event=>{
    if(event.key==='Tab'){
      const controls=[...modal.querySelectorAll('button,input,[contenteditable="true"]')].filter(el=>!el.hidden&&!el.disabled&&!el.closest('.hidden'));
      const first=controls[0],last=controls[controls.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    }
  });
  // Esc works wherever focus is (e.g. after the focused photo button was removed).
  document.addEventListener('keydown',event=>{
    if(event.key!=='Escape'||!viewing)return;
    event.stopPropagation();event.preventDefault();
    if(!lightbox.classList.contains('hidden'))hideLarge();else closeView();
  },true);
  byId('memoDelete').addEventListener('click',()=>{if(viewing&&!busy&&!uploading)deleteMemo(viewing);});

  // ---- Attaching photos ----
  async function prepareImage(file){
    if(!/^image\/(png|jpeg|webp|gif)$/.test(file.type))throw Error('PNG, JPG, WebP, GIF 사진을 선택해주세요.');
    if(file.size>20*1024*1024)throw Error('20MB 이하의 사진을 선택해주세요.');
    if(file.size<=1048576)return file;
    const bitmap=await createImageBitmap(file);const canvas=document.createElement('canvas');
    const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
    canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.8));
    if(!blob||blob.size>1048576)throw Error('사진 크기를 줄인 뒤 다시 넣어주세요.');return blob;
  }
  async function attachImages(item,files){
    if(!item||uploading)return;
    uploading++;
    try{
      for(const file of files){
        if(item.imageList.length>=MAX_IMAGES)throw Error('사진은 메모 하나에 '+MAX_IMAGES+'장까지 첨부할 수 있어요.');
        status('사진을 올리고 있어요…');
        const blob=await prepareImage(file);
        const response=await send('/api/private/memo-images',{method:'POST',headers:{'Content-Type':blob.type},body:blob,redirect:'error'});
        if(!response.ok)throw Error('사진을 저장하지 못했어요. 로그인을 확인하고 다시 시도해주세요.');
        const id=IMAGE_URL.exec((await response.json()).url||'')?.[1];if(!id)throw Error('사진을 저장하지 못했어요.');
        item.imageList=[...item.imageList,id];
        if(viewing===item)renderGallery();
      }
      await saveNow(item);
      status(viewing===item?'사진을 첨부했어요.':'사진을 첨부했어요. 전체보기에서 볼 수 있어요.');
      if(viewing!==item)render();
    }catch(error){status(error.message);if(item.imageList.length)saveNow(item);}
    finally{uploading--;}
  }
  byId('memoPhotoButton').addEventListener('click',()=>byId('memoPhotoInput').click());
  byId('memoPhotoInput').addEventListener('change',event=>{const files=[...event.target.files];event.target.value='';if(viewing)attachImages(viewing,files);});
  gallery.parentElement.addEventListener('dragover',event=>{event.preventDefault();});
  gallery.parentElement.addEventListener('drop',event=>{event.preventDefault();const files=[...(event.dataTransfer?.files||[])].filter(f=>f.type.startsWith('image/'));if(files.length&&viewing)attachImages(viewing,files);});

  // Save anything pending when the tab is hidden or closed.
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flushAll();});
  window.addEventListener('beforeunload',event=>{
    if(uploading||timers.size||pendingDeletes.size||items.some(i=>i.saving)){flushAll();event.preventDefault();event.returnValue='';}
  });
  if(isOwner&&!byId('memosPage').classList.contains('hidden'))window.loadMemoBoard();
})();
