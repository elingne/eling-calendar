/* 금주의 메모: 캘린더 위쪽의 가로 메모지. 주(월요일 날짜)마다 한 장이 따로 저장되고, 쓰는 대로 자동 저장돼요. 관리자만 볼 수 있어요. */
(() => {
  const byId = id => document.getElementById(id);
  const card = byId('weekMemoCard'), area = byId('weekMemoText');
  const range = byId('weekMemoRange'), status = byId('weekMemoStatus');
  if (!card || !area) return;
  const SAVE_DELAY = 800;
  let week = '', savedBody = '', saving = false, timer = null, loading = false;

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
  const say = (text, isError) => { status.textContent = text || ''; status.className = 'week-memo-status' + (isError ? ' error' : ''); };
  const dirty = () => area.value !== savedBody;

  // 글이 길어지면 칸이 함께 늘어난다 (너무 길면 칸 안에서 스크롤).
  function fit() {
    area.style.height = 'auto';
    area.style.height = Math.min(Math.max(area.scrollHeight + 2, 114), 420) + 'px';
  }

  async function api(body, keepalive) {
    const url = '/api/private/week-memo' + (body ? '' : '?week=' + week);
    const options = body
      ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), redirect: 'error', keepalive: Boolean(keepalive) }
      : { cache: 'no-store', redirect: 'error' };
    // 오프라인이거나 로그인이 만료되면 fetch 가 실패한다.
    const response = await fetch(url, options).catch(() => { throw Error('연결에 실패했어요. 로그인이 만료됐다면 새로고침해주세요.'); });
    let result; try { result = await response.json(); } catch { throw Error('로그인을 확인한 뒤 다시 시도해주세요.'); }
    if (!response.ok) throw Error(result.error?.message || result.error || '저장에 실패했어요. 다시 시도해주세요.');
    return result.data;
  }

  // 바뀐 내용이 있으면 저장한다. 저장 중에 또 쓰면 끝난 뒤 이어서 한 번 더 저장한다.
  async function save(keepalive) {
    clearTimeout(timer); timer = null;
    if (saving || !dirty() || !week) return;
    const body = area.value;
    saving = true; say('저장 중…');
    let ok = false;
    try { await api({ action: 'save', week, body }, keepalive); savedBody = body; say('저장됨'); ok = true; }
    catch (error) { say(error.message, true); }
    finally { saving = false; }
    if (ok && dirty()) save();
  }
  const later = () => { clearTimeout(timer); timer = setTimeout(save, SAVE_DELAY); };

  async function load() {
    if (loading) return;
    loading = true;
    try {
      const monday = thisMonday(), current = key(monday);
      // 새 주가 시작됐는데 이전 주에 저장 안 된 글이 있으면 먼저 저장한다.
      if (week && week !== current && dirty()) await save();
      if (saving || dirty() || (week === current && document.activeElement === area)) return;   // 쓰는 중인 글은 덮어쓰지 않는다.
      week = current;
      showRange(monday);
      const data = await api();
      if (dirty()) return;                             // 불러오는 사이에 쓰기 시작했다면 그대로 둔다.
      savedBody = data.body; area.value = data.body; fit(); say('');
    } catch (error) { say(error.message, true); }
    finally { loading = false; }
  }

  area.addEventListener('input', () => { fit(); say(''); later(); });
  area.addEventListener('blur', () => save());
  window.loadWeekMemo = load;
  if (window.weekMemoPending) { window.weekMemoPending = false; load(); }

  // 창을 닫거나 다른 탭으로 가면 바로 저장하고, 돌아왔을 때(새 주가 시작됐거나 다른 기기에서 바꿨을 때) 최신으로 맞춘다.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') save(true);
    else if (!card.classList.contains('hidden')) load();
  });
  window.addEventListener('pagehide', () => save(true));
})();
