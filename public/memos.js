/* Private memo board. Images use authenticated endpoints, never public asset URLs. */
(() => {
  const byId=id=>document.getElementById(id);
  const board=byId('memoBoard'), modal=byId('memoModal'), editor=byId('memoEditor');
  let items=[], folderId=null, editing=null, savedRange=null, busy=false, uploading=0, suppressClick=0, returnFocus=null;
  const status=(text,edit=false)=>{byId(edit?'memoEditorStatus':'memoStatus').textContent=text;};
  async function api(body) {
    const response=await fetch('/api/private/memos',body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),redirect:'error'}:{cache:'no-store',redirect:'error'});
    let result;try{result=await response.json();}catch{throw Error('로그인을 확인한 뒤 다시 시도해주세요.');}
    if(!response.ok)throw Error(result.error?.message||result.error||'저장에 실패했어요. 다시 시도해주세요.');
    return result;
  }
  async function attempt(task) {try{await task();}catch(error){status(error.message);}}
  // Rebuild a tiny safe HTML subset; never trust pasted HTML or stored markup.
  function safeContent(html) {
    const template=document.createElement('template');template.innerHTML=html;
    const fragment=document.createDocumentFragment();
    const allowed=new Set(['DIV','P','BR','B','STRONG','I','EM','U','UL','OL','LI','BLOCKQUOTE']);
    const copy=(node,parent)=>{
      if(node.nodeType===3){parent.appendChild(document.createTextNode(node.textContent));return;}
      if(node.nodeType!==1)return;
      if(['SCRIPT','STYLE','IFRAME','OBJECT','SVG'].includes(node.tagName))return;
      if(node.tagName==='IMG'){
        const src=node.getAttribute('src')||'';
        if(/^\/api\/private\/memo-images\/[a-zA-Z0-9-]{1,80}$/.test(src)){
          const img=document.createElement('img');img.src=src;img.alt='메모 사진';img.loading='lazy';parent.appendChild(img);
        }
        return;
      }
      const target=allowed.has(node.tagName)?document.createElement(node.tagName.toLowerCase()):parent;
      if(target!==parent)parent.appendChild(target);
      for(const child of node.childNodes)copy(child,target);
    };
    for(const node of template.content.childNodes)copy(node,fragment);
    return fragment;
  }
  function contentHTML(){const div=document.createElement('div');div.appendChild(safeContent(editor.innerHTML));return div.innerHTML;}
  function button(text,action,cls='memo-small-button') {
    const b=document.createElement('button');b.type='button';b.textContent=text;b.className=cls;
    b.addEventListener('click',event=>{event.stopPropagation();attempt(action);});return b;
  }
  window.loadMemoBoard=async()=>{
    if(!isOwner)return;
    try{items=(await api()).data;render();status('');}catch(error){status(error.message);}
  };
  function render() {
    if(folderId&&!items.some(i=>i.id===folderId&&i.kind==='folder'))folderId=null;
    board.innerHTML='';
    byId('memoBack').classList.toggle('hidden',!folderId);
    byId('memoFolderTitle').textContent=folderId?items.find(i=>i.id===folderId)?.title:'';
    const visible=items.filter(i=>(i.folder_id||null)===folderId);
    if(!visible.length){const hint=document.createElement('span');hint.className='memo-empty-hint';hint.textContent='빈 곳을 눌러 메모를 추가하세요';board.appendChild(hint);}
    let bottom=550;
    const compact=board.clientWidth<560;
    const columns=board.clientWidth>=390?2:1;
    const width=compact?Math.min(240,(board.clientWidth-12*(columns+1))/columns):240;
    for(const [index,item] of visible.entries()){
      const card=document.createElement('article');card.className='memo-card '+(item.kind==='folder'?'memo-folder':'');card.dataset.memoId=item.id;
      const x=compact?12+(index%columns)*(width+12):Math.min(item.x,Math.max(8,board.clientWidth-width-12)), y=compact?12+Math.floor(index/columns)*280:Math.max(12,item.y);
      card.style.left=x+'px';card.style.top=y+'px';card.style.width=width+'px';bottom=Math.max(bottom,y+290);
      const header=document.createElement('div');header.className='memo-card-header';
      const handle=button('⠿',()=>{},'memo-drag-handle');handle.setAttribute('aria-label','메모 이동');handle.title='여기를 끌어 이동하거나 다른 메모 위에 놓으세요';
      const title=button((item.kind==='folder'?'📁 ':'')+(item.title||'제목 없는 메모'),()=>item.kind==='folder'?openFolder(item):openEditor(item),'memo-card-title');
      header.append(handle,title);card.appendChild(header);
      const preview=document.createElement('div');preview.className='memo-preview';
      if(item.kind==='folder'){
        const children=items.filter(i=>i.folder_id===item.id);
        preview.textContent=children.length+'개의 메모';
        for(const child of children.slice(0,3)){const p=document.createElement('p');p.textContent=child.title||plainText(child.content).slice(0,60)||'빈 메모';preview.appendChild(p);}
      }else preview.appendChild(safeContent(item.content));
      preview.addEventListener('click',event=>{event.stopPropagation();if(Date.now()<suppressClick)return;item.kind==='folder'?openFolder(item):openEditor(item);});
      card.appendChild(preview);
      const actions=document.createElement('div');actions.className='memo-card-actions';
      if(item.kind==='folder'){
        actions.appendChild(button('이름 바꾸기',async()=>{
          const title=window.prompt('폴더 이름',item.title);if(title===null||!title.trim())return;
          await api({action:'save',id:item.id,title:title.trim(),content:''});await window.loadMemoBoard();
        }));
        actions.appendChild(button('폴더 풀기',async()=>{await api({action:'delete',id:item.id});await window.loadMemoBoard();}));
      }else if(folderId)actions.appendChild(button('폴더 밖으로',async()=>{await api({action:'move',id:item.id,x:24+items.length%3*24,y:24+items.length%5*32,folder_id:null});await window.loadMemoBoard();}));
      card.appendChild(actions);board.appendChild(card);enableDrag(handle,card,item);
    }
    board.style.minHeight=bottom+'px';
  }
  function plainText(html){const div=document.createElement('div');div.appendChild(safeContent(html));return div.textContent;}
  function openFolder(item){folderId=item.id;render();}
  byId('memoBack').addEventListener('click',()=>{folderId=null;render();});
  async function create(x=24,y=24){
    if(!isOwner||busy)return;busy=true;
    try{const {id}=await api({action:'create',x,y,folder_id:folderId});await window.loadMemoBoard();const item=items.find(i=>i.id===id);if(item)openEditor(item);}
    catch(error){status(error.message);}finally{busy=false;}
  }
  board.addEventListener('click',event=>{
    if(Date.now()<suppressClick||event.target.closest('.memo-card'))return;
    const rect=board.getBoundingClientRect();create(Math.max(12,Math.min(event.clientX-rect.left-30,board.clientWidth-252)),Math.max(12,event.clientY-rect.top-20));
  });
  byId('newMemoButton').addEventListener('click',()=>create(24+items.length%4*25,24+items.length%5*30));
  function enableDrag(handle,card,item){
    handle.addEventListener('pointerdown',event=>{
      if(event.button!==0||busy)return;
      const startX=event.clientX,startY=event.clientY,initialX=parseFloat(card.style.left),initialY=parseFloat(card.style.top);
      let moved=false,target=null;
      handle.setPointerCapture(event.pointerId);
      const move=e=>{
        if(Math.hypot(e.clientX-startX,e.clientY-startY)<7&&!moved)return;
        moved=true;card.classList.add('memo-dragging');
        card.style.left=Math.max(8,Math.min(board.clientWidth-card.offsetWidth-8,initialX+e.clientX-startX))+'px';
        card.style.top=Math.max(12,initialY+e.clientY-startY)+'px';
        board.style.minHeight=Math.max(parseFloat(board.style.minHeight),parseFloat(card.style.top)+290)+'px';
        board.querySelectorAll('.memo-drop-target').forEach(el=>el.classList.remove('memo-drop-target'));
        target=null;
        if(item.kind==='note'){
          const candidates=[...board.querySelectorAll('.memo-card')].filter(el=>el!==card);
          const a=card.getBoundingClientRect();
          target=candidates.find(el=>{const b=el.getBoundingClientRect();const cx=a.left+a.width/2,cy=a.top+a.height/2;return cx>b.left&&cx<b.right&&cy>b.top&&cy<b.bottom;})||null;
          target?.classList.add('memo-drop-target');
        }
      };
      const finish=async e=>{
        handle.removeEventListener('pointermove',move);handle.removeEventListener('pointerup',finish);handle.removeEventListener('pointercancel',cancel);
        card.classList.remove('memo-dragging');if(!moved)return;
        suppressClick=Date.now()+450;busy=true;
        try{
          if(target){
            const other=items.find(i=>i.id===target.dataset.memoId);
            const title=other.kind==='folder'?other.title:window.prompt('새 폴더 이름','새 폴더');
            if(title!==null&&title.trim())await api({action:'group',id:item.id,target:other.id,title:title.trim()});
          }else await api({action:'move',id:item.id,x:parseFloat(card.style.left),y:parseFloat(card.style.top),folder_id:folderId});
          await window.loadMemoBoard();
        }catch(error){status(error.message);render();}finally{busy=false;}
      };
      const cancel=()=>{handle.removeEventListener('pointermove',move);handle.removeEventListener('pointerup',finish);handle.removeEventListener('pointercancel',cancel);suppressClick=Date.now()+450;render();};
      handle.addEventListener('pointermove',move);handle.addEventListener('pointerup',finish);handle.addEventListener('pointercancel',cancel);
    });
  }
  function openEditor(item){
    editing=item;returnFocus=document.activeElement;savedRange=null;
    byId('memoTitle').value=item.title;editor.innerHTML='';editor.appendChild(safeContent(item.content));
    status('',true);modal.classList.remove('hidden');document.body.classList.add('memo-editing');editor.focus();
  }
  function closeEditor(force=false){
    if(uploading||busy)return;
    if(!force&&editing&&(byId('memoTitle').value!==editing.title||contentHTML()!==normalized(editing.content))&&!window.confirm('저장하지 않은 내용을 닫을까요?'))return;
    modal.classList.add('hidden');document.body.classList.remove('memo-editing');editing=null;returnFocus?.focus();
  }
  function normalized(html){const div=document.createElement('div');div.appendChild(safeContent(html));return div.innerHTML;}
  byId('memoClose').addEventListener('click',()=>closeEditor());
  byId('memoSave').addEventListener('click',async()=>{
    if(!editing||uploading||busy)return;busy=true;byId('memoSave').disabled=true;
    try{await api({action:'save',id:editing.id,title:byId('memoTitle').value,content:contentHTML()});busy=false;closeEditor(true);await window.loadMemoBoard();status('메모를 저장했어요.');}
    catch(error){status(error.message,true);}finally{busy=false;byId('memoSave').disabled=false;}
  });
  byId('memoDelete').addEventListener('click',async()=>{
    if(!editing||busy||uploading||!window.confirm('이 메모를 삭제할까요?'))return;
    busy=true;try{await api({action:'delete',id:editing.id});busy=false;closeEditor(true);await window.loadMemoBoard();}catch(error){status(error.message,true);}finally{busy=false;}
  });
  modal.addEventListener('click',event=>{if(event.target===modal)closeEditor();});
  modal.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.stopPropagation();closeEditor();}
    if(event.key==='Tab'){
      const controls=[...modal.querySelectorAll('button,input,[contenteditable="true"]')].filter(el=>!el.hidden&&!el.disabled);
      const first=controls[0],last=controls[controls.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    }
  });
  function rememberRange(){const s=window.getSelection();if(s.rangeCount&&editor.contains(s.anchorNode))savedRange=s.getRangeAt(0).cloneRange();}
  for(const name of ['keyup','mouseup','input','touchend'])editor.addEventListener(name,rememberRange);
  function restoreRange(range=savedRange){
    editor.focus();const s=window.getSelection();s.removeAllRanges();
    if(range&&editor.contains(range.commonAncestorContainer))s.addRange(range);
    else{const r=document.createRange();r.selectNodeContents(editor);r.collapse(false);s.addRange(r);}
  }
  function insertNode(node,range=savedRange){restoreRange(range);const s=window.getSelection(),r=s.getRangeAt(0);r.deleteContents();r.insertNode(node);r.setStartAfter(node);r.collapse(true);s.removeAllRanges();s.addRange(r);rememberRange();}
  byId('memoPhotoButton').addEventListener('pointerdown',event=>{event.preventDefault();rememberRange();});
  byId('memoPhotoButton').addEventListener('click',()=>byId('memoPhotoInput').click());
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
  async function addImages(files,range=savedRange){
    if(!editing||uploading)return;uploading++;byId('memoSave').disabled=true;editor.contentEditable='false';
    try{
      for(const file of files){
        status('사진을 저장하고 있어요…',true);const blob=await prepareImage(file);
        const response=await fetch('/api/private/memo-images',{method:'POST',headers:{'Content-Type':blob.type},body:blob,redirect:'error'});
        if(!response.ok)throw Error('사진을 저장하지 못했어요. 로그인을 확인하고 다시 시도해주세요.');
        const {url}=await response.json();const img=document.createElement('img');img.src=url;img.alt='메모 사진';
        editor.contentEditable='true';insertNode(img,range);range=savedRange;editor.contentEditable='false';
      }
      status('사진을 넣었어요. 메모 저장을 눌러주세요.',true);
    }catch(error){status(error.message,true);}finally{uploading--;editor.contentEditable='true';byId('memoSave').disabled=false;}
  }
  byId('memoPhotoInput').addEventListener('change',event=>{addImages([...event.target.files]);event.target.value='';});
  editor.addEventListener('paste',event=>{
    event.preventDefault();rememberRange();const files=[...event.clipboardData.files];
    if(files.length){addImages(files);return;}
    insertNode(document.createTextNode(event.clipboardData.getData('text/plain')));
  });
  editor.addEventListener('dragover',event=>{event.preventDefault();event.dataTransfer.dropEffect='copy';});
  editor.addEventListener('drop',event=>{
    event.preventDefault();const files=[...event.dataTransfer.files];
    let range=document.caretRangeFromPoint?.(event.clientX,event.clientY);
    if(!range&&document.caretPositionFromPoint){const p=document.caretPositionFromPoint(event.clientX,event.clientY);if(p){range=document.createRange();range.setStart(p.offsetNode,p.offset);range.collapse(true);}}
    if(range&&editor.contains(range.commonAncestorContainer))savedRange=range;
    if(files.length)addImages(files,savedRange);
    else{const text=event.dataTransfer.getData('text/plain');if(text)insertNode(document.createTextNode(text));}
  });
  let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(!byId('memosPage').classList.contains('hidden')&&!editing)render();},150);});
  window.addEventListener('beforeunload',event=>{if(editing&&(uploading||byId('memoTitle').value!==editing.title||contentHTML()!==normalized(editing.content))){event.preventDefault();event.returnValue='';}});
  if(isOwner&&!byId('memosPage').classList.contains('hidden'))window.loadMemoBoard();
})();
