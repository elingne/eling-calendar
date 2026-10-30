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
    card.classList.toggle('memo-line-start',!!item.line_break);
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
          board.querySelector('.memo-card[data-draft]')?.setAttribute('data-memo-id',item.id);
          board.querySelector(`.memo-card[data-memo-id="${item.id}"]`)?.removeAttribute('data-draft');
        }
        item.content=cleanHTML(item.content);   // text only; photos live in the attachment list
        await api({action:'save',id:item.id,title:item.title,content:item.content,images:item.imageList,color:item.color||'',line_break:!!item.line_break});
        item.images=JSON.stringify(item.imageList);
        status('저장했어요');
      }catch(error){status(error.message);}
      finally{item.saving=null;if(item.again){item.again=false;saveNow(item);}}
    })();
    return item.saving;
  }
  const flushAll=()=>Promise.all([...timers.keys()].map(saveNow).concat(items.filter(i=>i.saving).map(i=>i.saving)));
  function setItems(rows){
    items=rows.map(row=>({...row,title:row.title||'',content:row.content||'',color:COLORS.includes(row.color)?row.color:'',line_break:!!row.line_break,imageList:row.kind==='note'?imagesOf(row):[]}));
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

  // ---- Board ----
  function render() {
    if(folderId&&!items.some(i=>i.id===folderId&&i.kind==='folder'))folderId=null;
    board.innerHTML='';
    byId('memoBack').classList.toggle('hidden',!folderId);
    byId('memoFolderTitle').textContent=folderId?items.find(i=>i.id===folderId)?.title:'';
    const visible=items.filter(i=>(i.folder_id||null)===folderId);
    if(!visible.length){const hint=document.createElement('span');hint.className='memo-empty-hint';hint.textContent='빈 곳을 누르거나 + 메모를 눌러 메모를 추가하세요';board.appendChild(hint);}
    for(const item of visible)board.appendChild(item.kind==='folder'?folderCard(item):noteCard(item));
  }
  function noteCard(item){
    const card=document.createElement('article');card.className='memo-card';
    if(item.id)card.dataset.memoId=item.id;else card.dataset.draft='';
    const header=document.createElement('div');header.className='memo-card-header';
    const handle=button('⠿',()=>{},'memo-drag-handle');handle.setAttribute('aria-label','메모 순서 바꾸기 또는 폴더로 묶기');handle.title='끌어서 순서를 바꾸거나 다른 메모 위에 놓아 폴더로 묶으세요 (키보드: 방향키)';
    const title=document.createElement('input');title.type='text';title.className='memo-card-title-input';title.maxLength=120;title.placeholder='제목';title.value=item.title;title.setAttribute('aria-label','메모 제목');
    title.addEventListener('input',()=>{item.title=title.value;queueSave(item);});
    title.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();body.focus();}});
    const open=button('전체보기',()=>openView(item),'memo-open-button');open.title='크게 보기 · 첨부한 사진 보기';
    header.append(handle,title,open);
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
      suppressClick=Date.now()+350;
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
  function create(){
    if(!isOwner||busy)return;
    let draft=items.find(i=>!i.id&&(i.folder_id||null)===folderId);
    if(!draft){draft={id:null,kind:'note',title:'',content:'',images:'[]',imageList:[],color:'',line_break:false,folder_id:folderId};items.push(draft);render();}
    const card=board.querySelector('.memo-card[data-draft]');
    card?.scrollIntoView?.({block:'nearest'});card?.querySelector('.memo-body')?.focus();
  }
  byId('newMemoButton').addEventListener('click',()=>create());
  // Clicking any empty part of the memo tab (not a card, button, field or text) adds a memo.
  byId('memosPage').addEventListener('click',event=>{
    if(Date.now()<suppressClick||busy)return;
    if(event.target.closest('.memo-card,button,a,input,textarea,select,label,[contenteditable="true"],h1,h2,p,.section-label,#memoStatus'))return;
    if(String(window.getSelection?.()||''))return;
    create();
  });

  // ---- Reordering and folders (drag the ⠿ handle) ----
  const savedIds=()=>items.filter(i=>i.id&&(i.folder_id||null)===folderId).map(i=>i.id);
  function orderedIds(id,index){
    const ids=savedIds();
    const from=ids.indexOf(id);if(from<0||index<0||index>=ids.length||index===from)return null;
    ids.splice(from,1);ids.splice(index,0,id);return ids;
  }
  async function saveOrder(ids,breaks){
    busy=true;
    try{
      await flushAll();
      breaks??=items.filter(i=>i.id&&i.line_break&&ids.includes(i.id)).map(i=>i.id);
      await api({action:'reorder',folder_id:folderId,ids,breaks});await window.loadMemoBoard();
    }
    catch(error){status(error.message);render();}finally{busy=false;}
  }
  function enableReorder(handle,card,item){
    // Keyboard: arrow keys move the memo one place earlier/later.
    handle.addEventListener('keydown',event=>{
      const step={ArrowUp:-1,ArrowLeft:-1,ArrowDown:1,ArrowRight:1}[event.key];if(!step||busy)return;
      event.preventDefault();event.stopPropagation();
      const ids=orderedIds(item.id,savedIds().indexOf(item.id)+step);
      if(ids)saveOrder(ids).then(()=>board.querySelector(`[data-memo-id="${item.id}"] .memo-drag-handle`)?.focus());
    });
    handle.addEventListener('pointerdown',event=>{
      if(event.button!==0||busy)return;
      const startX=event.clientX,startY=event.clientY,startScroll=window.scrollY;
      let moved=false,hit=null;   // hit = {el, zone:'before'|'after'|'group'}
      handle.setPointerCapture?.(event.pointerId);
      const cards=()=>[...board.querySelectorAll('.memo-card[data-memo-id]')].filter(el=>el!==card);
      const clear=()=>{board.querySelectorAll('.memo-drop-target,.memo-drop-before,.memo-drop-after').forEach(el=>el.classList.remove('memo-drop-target','memo-drop-before','memo-drop-after'));board.classList.remove('memo-drop-newline');};
      // Cards grouped into the rows they are shown in.
      const rows=()=>{const out=[];for(const el of cards()){const b=el.getBoundingClientRect(),row=out.find(r=>Math.abs(r.top-b.top)<20);if(row)row.cards.push(el);else out.push({top:b.top,bottom:b.bottom,cards:[el]});}
        for(const r of out){r.cards.sort((x,y)=>x.getBoundingClientRect().left-y.getBoundingClientRect().left);r.bottom=Math.max(...r.cards.map(c=>c.getBoundingClientRect().bottom));}
        return out.sort((x,y)=>x.top-y.top);};
      const move=e=>{
        if(Math.hypot(e.clientX-startX,e.clientY-startY)<7&&!moved)return;
        moved=true;card.classList.add('memo-dragging');
        // Near the top/bottom of the screen the page scrolls, so long lists can be reordered on a phone.
        if(e.clientY<70)window.scrollBy?.(0,-16);else if(e.clientY>window.innerHeight-70)window.scrollBy?.(0,16);
        card.style.transform=`translate(${e.clientX-startX}px,${e.clientY-startY+window.scrollY-startScroll}px)`;
        clear();hit=null;
        const el=cards().find(c=>{const b=c.getBoundingClientRect();return e.clientX>=b.left&&e.clientX<=b.right&&e.clientY>=b.top&&e.clientY<=b.bottom;});
        if(!el){
          const all=rows();if(!all.length)return;
          const last=all[all.length-1];
          if(e.clientY>last.bottom){hit={zone:'newline'};board.classList.add('memo-drop-newline');return;}   // below every card
          const row=all.find(r=>e.clientY>=r.top&&e.clientY<=r.bottom);
          const end=row?.cards[row.cards.length-1];
          if(end&&e.clientX>end.getBoundingClientRect().right){hit={el:end,zone:'rowend'};end.classList.add('memo-drop-after');}
          return;
        }
        const b=el.getBoundingClientRect(),ratio=(e.clientX-b.left)/b.width;
        // Left/right edge of a card = place before/after it; the middle = make a folder (notes only).
        const zone=ratio<.28?'before':ratio>.72?'after':item.kind==='note'?'group':(ratio<.5?'before':'after');
        hit={el,zone};el.classList.add(zone==='group'?'memo-drop-target':'memo-drop-'+zone);
      };
      const stop=()=>{handle.removeEventListener('pointermove',move);handle.removeEventListener('pointerup',finish);handle.removeEventListener('pointercancel',cancel);card.classList.remove('memo-dragging');card.style.transform='';clear();};
      const finish=async()=>{
        const drop=hit;stop();if(!moved)return;suppressClick=Date.now()+450;
        if(!drop)return;
        if(drop.zone==='newline'){
          // Move to the very end and start a new row there.
          const ids=savedIds().filter(id=>id!==item.id).concat(item.id);
          const breaks=items.filter(i=>i.id&&i.line_break&&i!==item&&ids.includes(i.id)).map(i=>i.id).concat(item.id);
          saveOrder(ids,breaks);return;
        }
        const other=items.find(i=>i.id===drop.el.dataset.memoId);if(!other)return;
        if(drop.zone==='group'){
          busy=true;
          try{
            await flushAll();
            const name=other.kind==='folder'?other.title:window.prompt('새 폴더 이름','새 폴더');
            if(name!==null&&name.trim())await api({action:'group',id:item.id,target:other.id,title:name.trim()});
            await window.loadMemoBoard();
          }catch(error){status(error.message);render();}finally{busy=false;}
          return;
        }
        // Reorder: put the dragged memo right before/after the one it was dropped next to; it joins that
        // row. Placed before a row's first memo, it becomes the row's first memo instead.
        const before=savedIds(),ids=before.filter(id=>id!==item.id);
        ids.splice(ids.indexOf(other.id)+(drop.zone==='before'?0:1),0,item.id);
        const starts=new Set(items.filter(i=>i.id&&i.line_break).map(i=>i.id));
        const nextAfter=before[before.indexOf(item.id)+1];
        if(starts.has(item.id)&&nextAfter&&nextAfter!==other.id)starts.add(nextAfter);   // the row it leaves keeps its start
        starts.delete(item.id);
        if(drop.zone==='before'&&starts.has(other.id)){starts.delete(other.id);starts.add(item.id);}
        const breaks=ids.filter(id=>starts.has(id));
        const was=items.filter(i=>i.id&&i.line_break).map(i=>i.id).sort().join();
        if(ids.join()!==before.join()||breaks.slice().sort().join()!==was)saveOrder(ids,breaks);
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
    byId('memoLineBreak').checked=!!item.line_break;
  }
  for(const b of modal.querySelectorAll('[data-memo-color]')){
    b.title=COLOR_NAMES[b.dataset.memoColor];b.setAttribute('aria-label','메모지 색: '+COLOR_NAMES[b.dataset.memoColor]);
    b.addEventListener('click',()=>{if(!viewing)return;viewing.color=b.dataset.memoColor;renderViewLayout();if(viewing.id||!isEmpty(viewing))saveNow(viewing);});
  }
  byId('memoLineBreak').addEventListener('change',event=>{if(!viewing)return;viewing.line_break=event.target.checked;if(viewing.id||!isEmpty(viewing))saveNow(viewing);});
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
        if(!window.confirm('이 사진을 메모에서 뺄까요?'))return;
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
  byId('memoDelete').addEventListener('click',async()=>{
    const item=viewing;if(!item||busy||uploading)return;
    if(item.id&&!window.confirm('이 메모를 삭제할까요?'))return;
    busy=true;
    try{
      clearTimeout(timers.get(item));timers.delete(item);
      if(item.id)await api({action:'delete',id:item.id});
      items=items.filter(i=>i!==item);viewing=null;
      modal.classList.add('hidden');document.body.classList.remove('memo-editing');render();status('메모를 삭제했어요.');
    }catch(error){status(error.message);}finally{busy=false;}
  });

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
    if(uploading||timers.size||items.some(i=>i.saving)){flushAll();event.preventDefault();event.returnValue='';}
  });
  if(isOwner&&!byId('memosPage').classList.contains('hidden'))window.loadMemoBoard();
})();
