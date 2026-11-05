/* 금주의 할 일: 캘린더 위쪽의 가로 카드. 주(월요일 날짜)마다 목록이 따로 저장되고 관리자만 볼 수 있어요. */
(() => {
  const byId = id => document.getElementById(id);
  const card = byId('weekTodoCard'), list = byId('weekTodoList'), form = byId('weekTodoForm');
  const input = byId('weekTodoInput'), range = byId('weekTodoRange'), status = byId('weekTodoStatus');
  if (!card || !list || !form) return;
  let week = '', items = [], busy = false, editingId = null;

  const pad = n => String(n).padStart(2, '0');
  const key = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  // 이번 주 월요일 (브라우저의 현지 날짜 기준)
  function thisMonday() {
    const d = new Date();
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d;
  }
  function showRange(monday) {
    const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
    range.textContent = `${monday.getMonth() + 1}월 ${monday.getDate()}일 – ${sunday.getMonth() + 1}월 ${sunday.getDate()}일`;
  }
  const say = text => { status.textContent = text || ''; };

  async function api(body) {
    const url = '/api/private/week-todos' + (body ? '' : '?week=' + week);
    const options = body
      ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), redirect: 'error' }
      : { cache: 'no-store', redirect: 'error' };
    // 오프라인이거나 로그인이 만료되면 fetch 가 실패한다.
    const response = await fetch(url, options).catch(() => { throw Error('연결에 실패했어요. 로그인이 만료됐다면 새로고침해주세요.'); });
    let result; try { result = await response.json(); } catch { throw Error('로그인을 확인한 뒤 다시 시도해주세요.'); }
    if (!response.ok) throw Error(result.error?.message || result.error || '저장에 실패했어요. 다시 시도해주세요.');
    return result.data;
  }
  async function run(task) {
    if (busy) return false;
    busy = true;
    try { items = await task(); say(''); return true; }
    catch (error) { say(error.message); return false; }
    finally { busy = false; render(); }
  }

  function row(item) {
    const el = document.createElement('div');
    el.className = 'quick-item week-todo-item' + (item.is_done ? ' quick-item-completed' : '');

    const check = document.createElement('input');
    check.type = 'checkbox';
    check.checked = item.is_done;
    check.title = item.is_done ? '체크 해제' : '완료';
    check.addEventListener('change', () => run(() => api({ action: 'toggle', id: item.id, done: check.checked })));

    const content = document.createElement('div');
    content.className = 'quick-item-content quick-item-editable';
    content.title = '클릭해서 수정';
    if (editingId === item.id) {
      const edit = document.createElement('input');
      edit.type = 'text'; edit.className = 'quick-inline-input'; edit.maxLength = 120;
      edit.autocomplete = 'off'; edit.value = item.title;
      let finished = false;
      const finish = async save => {
        if (finished) return; finished = true;
        const title = edit.value.trim();
        editingId = null;
        if (save && title && title !== item.title) await run(() => api({ action: 'rename', id: item.id, title }));
        else render();
      };
      edit.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); finish(true); }
        else if (e.key === 'Escape') finish(false);
      });
      edit.addEventListener('blur', () => finish(true));
      content.appendChild(edit);
      setTimeout(() => { edit.focus(); edit.select(); }, 0);
    } else {
      const text = document.createElement('span');
      text.className = 'quick-item-title';
      text.textContent = item.title;
      content.appendChild(text);
      content.addEventListener('click', () => { if (busy) return; editingId = item.id; render(); });
    }

    // 확인창 없이 바로 지운다.
    const del = document.createElement('button');
    del.type = 'button'; del.className = 'quick-delete-button'; del.textContent = '×';
    del.title = '삭제'; del.setAttribute('aria-label', `${item.title} 삭제`);
    del.addEventListener('click', () => run(() => api({ action: 'delete', id: item.id })));

    el.append(check, content, del);
    return el;
  }

  function render() {
    list.replaceChildren();
    if (!items.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-text';
      empty.textContent = '이번 주에 할 일을 적어보세요.';
      list.appendChild(empty);
      return;
    }
    items.forEach(item => list.appendChild(row(item)));
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const title = input.value.trim();
    if (!title) return;
    if (await run(() => api({ action: 'add', week, title }))) input.value = '';
    input.focus();
  });

  async function load() {
    const monday = thisMonday();
    week = key(monday);
    showRange(monday);
    await run(() => api());
  }
  window.loadWeekTodos = load;
  if (window.weekTodosPending) { window.weekTodosPending = false; load(); }

  // 다른 탭에 있다가 돌아왔을 때(새 주가 시작됐거나 다른 기기에서 바꿨을 때) 최신으로 맞춘다.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !card.classList.contains('hidden') && editingId === null) load();
  });
})();
