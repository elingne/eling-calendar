/* 데스크톱 앱(위젯) 전용 화면. 앱 안에서만 동작하고 일반 브라우저에서는 아무 일도 하지 않는다.
   창 모양을 바꾸는 일은 앱이 이 사이트에만 열어준 명령(get_state, set_mode, set_pinned, start_drag, hide_window)으로만 한다.
   - 핀: 다른 창 위에 항상 띄우기 켜기/끄기
   - 위젯/전체 전환: 작은 위젯(오늘 일정 + 지금 할 일) ↔ 전체 화면
   - 숨기기: 창을 작업표시줄 알림 영역(트레이)으로 넣기. 트레이 아이콘을 누르면 다시 나온다 */
(() => {
  const bridge = window.__TAURI_INTERNALS__;
  if (!bridge || typeof bridge.invoke !== 'function') return;
  const call = (command, args) => Promise.resolve().then(() => bridge.invoke(command, args || {})).catch(() => null);

  const icon = paths => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
  const ICONS = {
    pin: icon('<path d="M12 16v6"/><path d="M8 3h8l-1.2 6.2L18 13v3H6v-3l3.2-3.8z"/>'),
    shrink: icon('<rect x="3" y="3" width="18" height="18" rx="3"/><rect x="12" y="12" width="9" height="9" rx="2" fill="currentColor"/>'),
    expand: icon('<path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/>'),
    hide: icon('<path d="M5 12h14"/>'),
    memo: icon('<path d="M5 3h14v18H5z"/><path d="M9 8h6"/><path d="M9 12h6"/><path d="M9 16h3"/>'),
    calendar: icon('<rect x="3" y="4" width="18" height="17" rx="3"/><path d="M3 10h18"/><path d="M8 2v4"/><path d="M16 2v4"/>')
  };

  let state = { mode: 'full', pinned: false };
  let view = 'calendar', todo = 'now';   // 위젯에서 보는 탭 (캘린더/메모), 할 일 쪽 (지금/완료)
  let ui = null;

  function build() {
    const button = (className, html) => {
      const element = document.createElement('button');
      element.type = 'button'; element.className = 'desktop-btn ' + className; element.innerHTML = html;
      return element;
    };
    const controls = document.createElement('div');
    controls.className = 'desktop-controls';
    const pin = button('desktop-pin', ICONS.pin), swap = button('desktop-view', ICONS.memo), mode = button('desktop-mode', ICONS.shrink), hide = button('desktop-hide', ICONS.hide);
    hide.title = '트레이로 숨기기'; hide.setAttribute('aria-label', '트레이로 숨기기');
    controls.append(pin, swap, mode, hide);

    const bar = document.createElement('div');
    bar.id = 'desktopBar'; bar.className = 'desktop-bar';
    const title = document.createElement('span');
    title.className = 'desktop-bar-title'; title.textContent = 'My Calendar';
    bar.append(title);

    const hint = document.createElement('div');
    hint.className = 'desktop-login-hint';
    const text = document.createElement('p');
    text.textContent = '위젯은 관리자 로그인 후에 쓸 수 있어요. 이메일로 받은 인증번호로 한 번만 로그인하면 돼요.';
    const login = document.createElement('button');
    login.type = 'button'; login.textContent = '관리자 로그인';
    hint.append(text, login);

    // 지금 해야 하는 일 / 완료한 일 머리글 옆 작은 전환 버튼
    const todoSwitches = [];
    document.querySelectorAll('.quick-current .quick-column-header, .quick-history .quick-column-header').forEach(header => {
      const toggle = document.createElement('button');
      toggle.type = 'button'; toggle.className = 'desktop-todo-switch';
      toggle.addEventListener('click', () => { todo = todo === 'now' ? 'done' : 'now'; render(); });
      header.append(toggle); todoSwitches.push(toggle);
    });

    document.body.prepend(bar);
    document.body.append(hint);

    pin.addEventListener('click', () => call('set_pinned', { pinned: !state.pinned }).then(apply));
    mode.addEventListener('click', () => call('set_mode', { mode: state.mode === 'widget' ? 'full' : 'widget' }).then(apply));
    swap.addEventListener('click', () => { view = view === 'calendar' ? 'memos' : 'calendar'; render(); });
    hide.addEventListener('click', () => call('hide_window'));
    login.addEventListener('click', () => { call('set_mode', { mode: 'full' }).then(apply).finally(() => { location.href = '/admin'; }); });
    // 위젯 모드에는 제목 막대가 없으므로 이 막대를 끌어서 창을 옮기고, 두 번 누르면 전체 화면으로 넓힌다.
    bar.addEventListener('mousedown', event => { if (event.button === 0 && !event.target.closest('button')) call('start_drag'); });
    bar.addEventListener('dblclick', event => { if (!event.target.closest('button')) call('set_mode', { mode: 'full' }).then(apply); });

    return { controls, bar, pin, mode, swap, todoSwitches };
  }

  // 위젯의 탭(캘린더/메모)과 할 일 쪽(지금/완료)을 화면에 맞춘다. 탭 전환은 사이트의 메뉴 버튼을 그대로 눌러서 한다.
  function render() {
    if (!ui) return;
    document.body.dataset.widgetTodo = todo;
    const toMemos = view === 'memos';
    if (state.mode === 'widget') document.querySelector(`.nav-button[data-page="${toMemos ? 'memos' : 'calendar'}"]`)?.click();
    ui.swap.innerHTML = toMemos ? ICONS.calendar : ICONS.memo;
    const label = toMemos ? '캘린더 보기' : '메모 보기';
    ui.swap.title = label; ui.swap.setAttribute('aria-label', label);
    ui.swap.hidden = state.mode !== 'widget';
    ui.todoSwitches.forEach(toggle => { toggle.textContent = todo === 'now' ? '완료한 일 ›' : '‹ 지금 할 일'; });
  }

  function apply(next) {
    if (!ui || !next || (next.mode !== 'widget' && next.mode !== 'full')) return;
    state = { mode: next.mode, pinned: Boolean(next.pinned) };
    const widget = state.mode === 'widget';
    document.body.classList.toggle('desktop-widget', widget);
    // 위젯 모드에서는 위쪽 막대에, 전체 모드에서는 원래 메뉴 줄 오른쪽에 같은 버튼을 둔다.
    if (widget) ui.bar.append(ui.controls);
    else document.querySelector('.header-actions')?.prepend(ui.controls);
    const pinLabel = state.pinned ? '항상 위에 두기 해제' : '항상 위에 두기';
    ui.pin.classList.toggle('active', state.pinned);
    ui.pin.setAttribute('aria-pressed', String(state.pinned));
    ui.pin.title = pinLabel; ui.pin.setAttribute('aria-label', pinLabel);
    const modeLabel = widget ? '전체 화면으로 넓히기' : '위젯으로 줄이기';
    ui.mode.innerHTML = widget ? ICONS.expand : ICONS.shrink;
    ui.mode.title = modeLabel; ui.mode.setAttribute('aria-label', modeLabel);
    render();
  }

  // 앱이 상태를 알려주는 길(트레이 메뉴에서 바꿨을 때 등)
  window.__elingDesktopState = apply;
  // 앱 명령을 쓸 수 없으면(권한 없음 등) 아무것도 바꾸지 않고 일반 사이트로 둔다.
  call('get_state').then(initial => {
    if (!initial) return;
    document.documentElement.classList.add('is-desktop-app');
    ui = build();
    apply(initial);
  });
})();
