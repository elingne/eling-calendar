/* Private memo board. Images use authenticated endpoints, never public asset URLs. */
(() => {
  const byId=id=>document.getElementById(id);
  const board=byId('memoBoard'), modal=byId('memoModal'), editor=byId('memoEditor');
  let items=[], folderId=null, editing=null, savedRange=null, busy=false, uploading=0, suppressClick=0, returnFocus=null;
  const status=(text,edit=false)=>{byId(edit?'memoEditorStatus':'memoStatus').textContent=text;};
  // fetch rejects when offline or when the Access session expired (redirect:'error').
  const send=(url,options)=>fetch(url,options).catch(()=>{throw Error('연결에 실패했어요. 로그인이 만료됐다면 새로고침해서 다시 로그인해주세요.');});
  async function api(body) {
    const response=await send('/api/private/memos',body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),redirect:'error'}:{cache:'no-store',redirect:'error'});
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
          const img=document.createElement('img');img.src=src;img.alt='메모 사진';img.loading='lazy';
          setImageLayout(img,node.getAttribute('data-width'),node.getAttribute('data-align'));parent.appendChild(img);
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
  // Photo size (10-100% of the memo width) and alignment are the only image attributes ever kept.
  function setImageLayout(img,width,align){
    const w=Math.round(Number(width));
    if(Number.isFinite(w)&&w>=10&&w<100){img.dataset.width=String(w);img.style.width=w+'%';}
    else{delete img.dataset.width;img.style.removeProperty('width');}
    if(['left','center','right'].includes(align))img.dataset.align=align;else delete img.dataset.align;
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
    if(!visible.length){const hint=document.createElement('span');hint.className='memo-empty-hint';hint.textContent='빈 곳을 누르거나 + 메모를 눌러 메모를 추가하세요';board.appendChild(hint);}
    for(const item of visible){
      const card=document.createElement('article');card.className='memo-card '+(item.kind==='folder'?'memo-folder':'');card.dataset.memoId=item.id;
      const header=document.createElement('div');header.className='memo-card-header';
      const handle=button('⠿',()=>{},'memo-drag-handle');handle.setAttribute('aria-label','메모 순서 바꾸기 또는 폴더로 묶기');handle.title='끌어서 순서를 바꾸거나 다른 메모 위에 놓아 폴더로 묶으세요 (키보드: 방향키)';
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
      }else if(folderId)actions.appendChild(button('폴더 밖으로',async()=>{await api({action:'unfold',id:item.id});await window.loadMemoBoard();}));
      card.appendChild(actions);board.appendChild(card);enableReorder(handle,card,item);
    }
  }
  function plainText(html){const div=document.createElement('div');div.appendChild(safeContent(html));return div.textContent;}
  function openFolder(item){folderId=item.id;render();}
  byId('memoBack').addEventListener('click',()=>{folderId=null;render();});
  async function create(){
    if(!isOwner||busy)return;busy=true;
    try{const {id}=await api({action:'create',folder_id:folderId});await window.loadMemoBoard();const item=items.find(i=>i.id===id);if(item)openEditor(item);}
    catch(error){status(error.message);}finally{busy=false;}
  }
  byId('newMemoButton').addEventListener('click',()=>create());
  // Clicking any empty part of the memo tab (not a card, button, field or text) adds a memo.
  byId('memosPage').addEventListener('click',event=>{
    if(Date.now()<suppressClick||busy)return;
    if(event.target.closest('.memo-card,button,a,input,textarea,select,label,[contenteditable="true"],h1,h2,p,.section-label,#memoStatus'))return;
    if(String(window.getSelection?.()||''))return;
    create();
  });
  // Order of the memos shown now (board or the open folder), with `id` moved to `index`.
  function orderedIds(id,index){
    const ids=items.filter(i=>(i.folder_id||null)===folderId).map(i=>i.id);
    const from=ids.indexOf(id);if(from<0||index<0||index>=ids.length||index===from)return null;
    ids.splice(from,1);ids.splice(index,0,id);return ids;
  }
  async function saveOrder(ids){
    busy=true;
    try{await api({action:'reorder',folder_id:folderId,ids});await window.loadMemoBoard();}
    catch(error){status(error.message);render();}finally{busy=false;}
  }
  function enableReorder(handle,card,item){
    // Keyboard: arrow keys move the memo one place earlier/later.
    handle.addEventListener('keydown',event=>{
      const step={ArrowUp:-1,ArrowLeft:-1,ArrowDown:1,ArrowRight:1}[event.key];if(!step||busy)return;
      event.preventDefault();event.stopPropagation();
      const visible=items.filter(i=>(i.folder_id||null)===folderId).map(i=>i.id);
      const ids=orderedIds(item.id,visible.indexOf(item.id)+step);
      if(ids)saveOrder(ids).then(()=>board.querySelector(`[data-memo-id="${item.id}"] .memo-drag-handle`)?.focus());
    });
    handle.addEventListener('pointerdown',event=>{
      if(event.button!==0||busy)return;
      const startX=event.clientX,startY=event.clientY,startScroll=window.scrollY;
      let moved=false,hit=null;   // hit = {el, zone:'before'|'after'|'group'}
      handle.setPointerCapture(event.pointerId);
      const cards=()=>[...board.querySelectorAll('.memo-card')].filter(el=>el!==card);
      const clear=()=>board.querySelectorAll('.memo-drop-target,.memo-drop-before,.memo-drop-after').forEach(el=>el.classList.remove('memo-drop-target','memo-drop-before','memo-drop-after'));
      const move=e=>{
        if(Math.hypot(e.clientX-startX,e.clientY-startY)<7&&!moved)return;
        moved=true;card.classList.add('memo-dragging');
        // The card follows the pointer visually only; the layout itself never changes.
        // Near the top/bottom of the screen the page scrolls, so long lists can be reordered on a phone.
        if(e.clientY<70)window.scrollBy(0,-16);else if(e.clientY>window.innerHeight-70)window.scrollBy(0,16);
        card.style.transform=`translate(${e.clientX-startX}px,${e.clientY-startY+window.scrollY-startScroll}px)`;
        clear();hit=null;
        const el=cards().find(c=>{const b=c.getBoundingClientRect();return e.clientX>=b.left&&e.clientX<=b.right&&e.clientY>=b.top&&e.clientY<=b.bottom;});
        if(!el)return;
        const b=el.getBoundingClientRect(),ratio=(e.clientX-b.left)/b.width;
        // Left/right edge of a card = place before/after it; the middle = make a folder (notes only).
        const zone=ratio<.28?'before':ratio>.72?'after':item.kind==='note'?'group':(ratio<.5?'before':'after');
        hit={el,zone};el.classList.add(zone==='group'?'memo-drop-target':'memo-drop-'+zone);
      };
      const stop=()=>{handle.removeEventListener('pointermove',move);handle.removeEventListener('pointerup',finish);handle.removeEventListener('pointercancel',cancel);card.classList.remove('memo-dragging');card.style.transform='';clear();};
      const finish=async()=>{
        const drop=hit;stop();if(!moved)return;suppressClick=Date.now()+450;
        if(!drop)return;
        const other=items.find(i=>i.id===drop.el.dataset.memoId);if(!other)return;
        if(drop.zone==='group'){
          busy=true;
          try{
            const title=other.kind==='folder'?other.title:window.prompt('새 폴더 이름','새 폴더');
            if(title!==null&&title.trim())await api({action:'group',id:item.id,target:other.id,title:title.trim()});
            await window.loadMemoBoard();
          }catch(error){status(error.message);render();}finally{busy=false;}
          return;
        }
        // Reorder: put the dragged memo right before/after the one it was dropped next to.
        const ids=items.filter(i=>(i.folder_id||null)===folderId).map(i=>i.id).filter(id=>id!==item.id);
        ids.splice(ids.indexOf(other.id)+(drop.zone==='after'?1:0),0,item.id);
        const before=items.filter(i=>(i.folder_id||null)===folderId).map(i=>i.id);
        if(ids.join()!==before.join())saveOrder(ids);
      };
      const cancel=()=>{stop();suppressClick=Date.now()+450;};
      handle.addEventListener('pointermove',move);handle.addEventListener('pointerup',finish);handle.addEventListener('pointercancel',cancel);
    });
  }
  // ---- Photo size / position inside the editor ----
  let selectedImg=null;
  const imageTools=byId('memoImageTools'),sizeInput=byId('memoImageSize');
  function selectImage(img){
    editor.querySelectorAll('img.memo-img-selected').forEach(el=>el.classList.remove('memo-img-selected'));
    selectedImg=img&&editor.contains(img)?img:null;
    imageTools.classList.toggle('hidden',!selectedImg);
    if(!selectedImg)return;
    selectedImg.classList.add('memo-img-selected');
    const w=Number(selectedImg.dataset.width)||100;sizeInput.value=w;byId('memoImageSizeLabel').textContent=w+'%';
    const align=selectedImg.dataset.align||'left';
    imageTools.querySelectorAll('[data-align]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.align===align)));
  }
  function applyImage(width,align){
    if(!selectedImg)return;
    setImageLayout(selectedImg,width??selectedImg.dataset.width,align??selectedImg.dataset.align);
    selectImage(selectedImg);
  }
  sizeInput.addEventListener('input',()=>applyImage(Number(sizeInput.value)));
  imageTools.querySelectorAll('[data-align]').forEach(b=>b.addEventListener('click',()=>applyImage(undefined,b.dataset.align)));
  byId('memoImageRemove').addEventListener('click',()=>{if(!selectedImg)return;const img=selectedImg;selectImage(null);img.remove();rememberRange();});
  editor.addEventListener('click',event=>selectImage(event.target.tagName==='IMG'?event.target:null));
  editor.addEventListener('keydown',event=>{
    if(selectedImg&&(event.key==='Delete'||event.key==='Backspace')&&!String(window.getSelection())){event.preventDefault();const img=selectedImg;selectImage(null);img.remove();}
    else if(selectedImg&&event.key==='Escape'){event.stopPropagation();selectImage(null);}
  });
  // Pointer drag on a photo: from its right edge it resizes, from anywhere else it moves the photo to
  // where it is dropped in the text. Works the same for mouse and touch (tap a photo first on touch).
  const nearEdge=(img,x)=>{const r=img.getBoundingClientRect();return x>r.right-22&&x<=r.right+4;};
  const caretAt=(x,y)=>{
    let range=document.caretRangeFromPoint?.(x,y);
    if(!range&&document.caretPositionFromPoint){const p=document.caretPositionFromPoint(x,y);if(p){range=document.createRange();range.setStart(p.offsetNode,p.offset);range.collapse(true);}}
    return range&&editor.contains(range.startContainer)?range:null;
  };
  editor.addEventListener('dragstart',event=>{if(event.target.tagName==='IMG')event.preventDefault();});
  editor.addEventListener('pointermove',event=>{
    if(event.target.tagName==='IMG'&&!event.buttons)event.target.style.cursor=event.target===selectedImg&&nearEdge(event.target,event.clientX)?'ew-resize':'move';
  });
  editor.addEventListener('pointerdown',event=>{
    const img=event.target;
    if(img.tagName!=='IMG'||event.button!==0)return;
    if(img!==selectedImg){selectImage(img);if(event.pointerType==='touch')return;}  // touch: first tap only selects
    event.preventDefault();
    const resize=nearEdge(img,event.clientX),startX=event.clientX,startY=event.clientY;
    const style=getComputedStyle(editor),full=editor.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight);
    const left=img.getBoundingClientRect().left;
    let moved=false;
    img.setPointerCapture?.(event.pointerId);
    const move=e=>{
      if(resize){applyImage(Math.max(10,Math.min(100,Math.round((e.clientX-left)/full*100))));return;}
      if(!moved&&Math.hypot(e.clientX-startX,e.clientY-startY)<8)return;
      moved=true;img.classList.add('memo-img-moving');
      const range=caretAt(e.clientX,e.clientY);   // show where the photo will land
      if(range){const sel=window.getSelection();sel.removeAllRanges();sel.addRange(range);}
    };
    const done=(e,drop)=>{
      img.removeEventListener('pointermove',move);img.removeEventListener('pointerup',up);img.removeEventListener('pointercancel',cancel);
      img.classList.remove('memo-img-moving');
      if(!drop||resize||!moved)return;
      const range=caretAt(e.clientX,e.clientY);
      if(range&&!img.contains(range.startContainer)){img.remove();insertNode(img,range);selectImage(img);}
    };
    const up=e=>done(e,true),cancel=e=>done(e,false);
    img.addEventListener('pointermove',move);img.addEventListener('pointerup',up);img.addEventListener('pointercancel',cancel);
  });
  function openEditor(item){
    editing=item;returnFocus=document.activeElement;savedRange=null;selectImage(null);
    byId('memoTitle').value=item.title;editor.innerHTML='';editor.appendChild(safeContent(item.content));
    status('',true);modal.classList.remove('hidden');document.body.classList.add('memo-editing');editor.focus();
  }
  function closeEditor(force=false){
    if(uploading||busy)return;
    if(!force&&editing&&(byId('memoTitle').value!==editing.title||contentHTML()!==normalized(editing.content))&&!window.confirm('저장하지 않은 내용을 닫을까요?'))return;
    selectImage(null);modal.classList.add('hidden');document.body.classList.remove('memo-editing');editing=null;returnFocus?.focus();
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
        const response=await send('/api/private/memo-images',{method:'POST',headers:{'Content-Type':blob.type},body:blob,redirect:'error'});
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
