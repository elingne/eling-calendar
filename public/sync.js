/* 실시간 동기화: 관리자 화면이 보이는 동안 서버의 변경 번호를 몇 초마다 확인하고, 다른 곳(웹·데스크톱 위젯)에서
   바뀌었으면 'calendar-remote-change' 를 보내 화면을 최신으로 맞춘다.
   - 글자를 쓰는 중이거나 끌어서 옮기는 중에는 화면을 새로 그리지 않고, 끝날 때까지 기다린다.
   - 화면이 숨겨져 있으면 확인을 멈추고, 다시 보이면 바로 확인한다.
   - 내가 저장해서 번호가 올라간 것은 다시 불러오지 않는다. */
(() => {
  const POLL_MS = 20000;
  const TEXT_TYPES = ['', 'text', 'search', 'date', 'time', 'number', 'url', 'email', 'tel', 'password'];
  // 목록을 다시 그려도 입력 내용이 사라지지 않는 칸은 기다릴 필요가 없다.
  const SAFE_IDS = ['quickTodoInput', 'completedTodoInput', 'searchInput', 'weekMemoText'];
  let known = null;      // 화면이 맞춰져 있는 변경 번호
  let seen = null;       // 서버에서 마지막으로 확인한 변경 번호
  let checking = false, pending = false, dragging = false;
  const nativeFetch = window.fetch.bind(window);

  // 저장 응답에 실린 새 번호가 '내 저장 하나만큼' 올라간 것이면 내 저장 때문에 바뀐 것이므로 번호만 맞춘다.
  // 그 사이 다른 곳에서도 저장했다면 번호가 더 크게 올라가므로 다음 확인 때 새로 불러온다.
  window.fetch = async (input, init) => {
    const response = await nativeFetch(input, init);
    try {
      const header = response.headers && response.headers.get('X-Sync-Version');
      const method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
      const version = Number(header);
      if (header !== null && method !== 'GET' && Number.isInteger(version) && known !== null && version === known + 1) {
        known = version;
        if (seen !== null && seen < version) seen = version;
        if (pending && seen === known) pending = false;
      }
    } catch { /* 번호를 못 읽어도 저장 흐름에는 영향이 없다 */ }
    return response;
  };

  const owner = () => typeof isOwner !== 'undefined' && Boolean(isOwner);

  function typing() {
    const el = document.activeElement;
    if (!el || el === document.body || SAFE_IDS.includes(el.id)) return false;
    if (el.isContentEditable) return true;
    const tag = String(el.tagName || '').toUpperCase();
    return tag === 'TEXTAREA' || (tag === 'INPUT' && TEXT_TYPES.includes(String(el.type || '').toLowerCase()));
  }
  const busy = () => dragging || (typeof scheduleTouchDragging !== 'undefined' && Boolean(scheduleTouchDragging)) || typing();

  document.addEventListener('dragstart', () => { dragging = true; }, true);
  document.addEventListener('dragend', () => { dragging = false; }, true);
  document.addEventListener('drop', () => { dragging = false; }, true);

  function flush() {
    if (!pending || busy()) return;
    pending = false;
    known = seen;
    window.dispatchEvent(new CustomEvent('calendar-remote-change'));
  }

  async function check() {
    if (checking || document.hidden || !owner()) return;
    checking = true;
    try {
      const response = await nativeFetch('/api/private/sync', { cache: 'no-store', redirect: 'error' });
      if (!response.ok) return;
      const version = Number(((await response.json()) || {}).data?.version);
      if (!Number.isInteger(version)) return;
      seen = version;
      if (known === null) known = version;      // 처음 확인한 번호가 기준이다. 방금 불러온 화면은 이미 최신이다.
      else if (version !== known) pending = true;
    } catch { return; }                         // 오프라인이거나 로그인이 만료됐으면 조용히 다음 기회에
    finally { checking = false; }
    flush();
  }

  window.setInterval(() => { if (pending) flush(); check(); }, POLL_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  window.addEventListener('calendar-session', check);   // 로그인 확인이 끝나는 즉시 기준 번호를 받아 둔다 (첫 20초 사이의 변경도 놓치지 않게)
  window.addEventListener('focus', check);
  window.addEventListener('online', check);
  window.calendarSync = { check };
})();
