let currentDate = new Date();
let currentSession = null;
let selectedRecordDate = null;
let goals = [];
let editingGoalId = null;
let stickers = [];
let badgeSettings = [];
let currentPeriodRecordId = null;
let clickTimer = null;
let dragStartDate = null;
let dragCurrentDate = null;
let didRangeDrag = false;

const MOODS = [
  { value: "great", label: "아주 좋음", fallback: "😄" },
  { value: "good", label: "좋음", fallback: "🙂" },
  { value: "neutral", label: "보통", fallback: "😐" },
  { value: "low", label: "안 좋음", fallback: "😔" },
  { value: "bad", label: "최악", fallback: "😣" }
];

const GOAL_STATUSES = [
  { value: "success", label: "성공" },
  { value: "effort", label: "노력은 함" },
  { value: "holiday", label: "휴일" },
  { value: "fail", label: "실패" }
];

const $ = (id) => document.getElementById(id);

const loginScreen = $("loginScreen");
const siteApp = $("siteApp");
const loginForm = $("loginForm");
const loginEmail = $("loginEmail");
const loginPassword = $("loginPassword");
const loginButton = $("loginButton");
const loginMessage = $("loginMessage");
const logoutButton = $("logoutButton");

const siteLockScreen = $("siteLockScreen");
const siteLockForm = $("siteLockForm");
const siteLockPinInput = $("siteLockPinInput");
const siteLockMessage = $("siteLockMessage");

const navButtons = [...document.querySelectorAll(".nav-button")];
const calendarPage = $("calendarPage");
const schedulePage = $("schedulePage");
const adminPage = $("adminPage");

const calendarTitle = $("calendarTitle");
const calendarGrid = $("calendarGrid");
const goalSummaryList = $("goalSummaryList");
const prevMonthButton = $("prevMonth");
const nextMonthButton = $("nextMonth");

const dayPanel = $("dayPanel");
const closeDayPanelButton = $("closeDayPanel");
const selectedDateTitle = $("selectedDateTitle");
const dailyGoalRecordList = $("dailyGoalRecordList");
const goalRecordSaveState = $("goalRecordSaveState");

const quickTodoInput = $("quickTodoInput");
const quickTodoAddButton = $("quickTodoAddButton");
const quickTodoList = $("quickTodoList");
const quickTodoMoreButton = $("quickTodoMoreButton");
const quickTodoHistory = $("quickTodoHistory");
const quickHistoryClose = $("quickHistoryClose");
const quickTodoCompletedList = $("quickTodoCompletedList");

const dayTodoForm = $("dayTodoForm");
const dayTodoInput = $("dayTodoInput");
const dayTodoList = $("dayTodoList");
const completedQuickOnDate = $("completedQuickOnDate");

const moodSelect = $("moodSelect");
const moodReason = $("moodReason");
const moodSaveButton = $("moodSaveButton");
const moodSaveState = $("moodSaveState");

const periodStateText = $("periodStateText");
const periodStartButton = $("periodStartButton");
const periodEndButton = $("periodEndButton");
const periodDeleteButton = $("periodDeleteButton");

const dayStickerSelect = $("dayStickerSelect");
const addStickerToDayButton = $("addStickerToDayButton");
const dayImageInput = $("dayImageInput");
const dayDecorationList = $("dayDecorationList");

const dayEventForm = $("dayEventForm");
const dayEventInput = $("dayEventInput");
const dayEventList = $("dayEventList");

const scheduleForm = $("scheduleForm");
const scheduleTitle = $("scheduleTitle");
const scheduleStart = $("scheduleStart");
const scheduleEnd = $("scheduleEnd");
const scheduleDescription = $("scheduleDescription");
const scheduleMessage = $("scheduleMessage");
const scheduleList = $("scheduleList");

const goalForm = $("goalForm");
const goalNameInput = $("goalNameInput");
const goalDescriptionInput = $("goalDescriptionInput");
const goalSubmitButton = $("goalSubmitButton");
const goalMessage = $("goalMessage");
const goalList = $("goalList");

const stickerForm = $("stickerForm");
const stickerNameInput = $("stickerNameInput");
const stickerFileInput = $("stickerFileInput");
const stickerMessage = $("stickerMessage");
const stickerAdminList = $("stickerAdminList");

const badgeAdminList = $("badgeAdminList");

const siteLockEnabled = $("siteLockEnabled");
const siteLockAdminPin = $("siteLockAdminPin");
const siteLockSaveButton = $("siteLockSaveButton");
const siteLockAdminMessage = $("siteLockAdminMessage");

const searchButton = $("searchButton");
const searchModal = $("searchModal");
const searchCloseButton = $("searchCloseButton");
const searchInput = $("searchInput");
const searchResults = $("searchResults");

/* AUTH */
async function checkSession() {
  const { data, error } = await supabaseClient.auth.getSession();
  if (error) {
    console.error(error);
    showLogin();
    return;
  }

  currentSession = data.session;

  if (currentSession) {
    await showSite();
  } else {
    showLogin();
  }
}

function showLogin() {
  loginScreen.classList.remove("hidden");
  siteApp.classList.add("hidden");
  siteLockScreen.classList.add("hidden");
  dayPanel.classList.remove("open");
}

async function showSite() {
  loginScreen.classList.add("hidden");
  siteApp.classList.remove("hidden");

  await Promise.all([
    loadBadgeSettings(),
    loadStickers()
  ]);

  showPage("calendar");
  renderCalendar();
  loadQuickTodos();
  await applySiteLockIfNeeded();
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginMessage.textContent = "";
  loginButton.disabled = true;
  loginButton.textContent = "로그인 중...";

  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email: loginEmail.value.trim(),
    password: loginPassword.value
  });

  loginButton.disabled = false;
  loginButton.textContent = "로그인";

  if (error) {
    loginMessage.textContent = "이메일 또는 비밀번호를 확인해주세요.";
    return;
  }

  currentSession = data.session;
  loginPassword.value = "";
  await showSite();
});

logoutButton.addEventListener("click", async () => {
  await supabaseClient.auth.signOut();
  currentSession = null;
  sessionStorage.removeItem("siteLockUnlocked");
  showLogin();
});

supabaseClient.auth.onAuthStateChange((event, session) => {
  currentSession = session;
  if (event === "SIGNED_OUT") showLogin();
});

/* NAV */
navButtons.forEach((button) => {
  button.addEventListener("click", () => showPage(button.dataset.page));
});

async function showPage(page) {
  calendarPage.classList.toggle("hidden", page !== "calendar");
  schedulePage.classList.toggle("hidden", page !== "schedule");
  adminPage.classList.toggle("hidden", page !== "admin");

  navButtons.forEach((button) =>
    button.classList.toggle("active", button.dataset.page === page)
  );

  dayPanel.classList.remove("open");

  if (page === "calendar") {
    renderCalendar();
    loadQuickTodos();
  }

  if (page === "schedule") {
    setScheduleDefaults();
    loadSchedulePage();
  }

  if (page === "admin") {
    await Promise.all([
      loadGoals(),
      loadStickers(),
      loadBadgeSettings(),
      loadSiteLockAdmin()
    ]);
    renderBadgeAdmin();
  }
}

/* UTILS */
function formatDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseLocalDate(key) {
  return new Date(`${key}T00:00:00`);
}

function niceDate(key) {
  const d = parseLocalDate(key);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function formatDateTime(value) {
  if (!value) return "";
  const d = new Date(value);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}

async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function readAndCompressImage(file, maxSize = 900, quality = 0.8) {
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const image = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });

  const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));

  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  return canvas.toDataURL("image/webp", quality);
}

/* CALENDAR */
function renderCalendar() {
  calendarGrid.innerHTML = "";

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  calendarTitle.textContent = `${year}년 ${month + 1}월`;

  const firstDay = new Date(year, month, 1).getDay();
  const lastDate = new Date(year, month + 1, 0).getDate();
  const previousMonthLastDate = new Date(year, month, 0).getDate();

  for (let i = firstDay - 1; i >= 0; i--) {
    createDayCell(new Date(year, month - 1, previousMonthLastDate - i), true);
  }

  for (let d = 1; d <= lastDate; d++) {
    createDayCell(new Date(year, month, d), false);
  }

  const totalCells = calendarGrid.children.length;
  const remaining = totalCells <= 35 ? 35 - totalCells : 42 - totalCells;

  for (let d = 1; d <= remaining; d++) {
    createDayCell(new Date(year, month + 1, d), true);
  }

  loadMonthlyGoalSummary(year, month);
  loadCalendarExtras(year, month);
}

function createDayCell(date, otherMonth) {
  const cell = document.createElement("div");
  cell.className = "calendar-day";
  cell.dataset.date = formatDateKey(date);

  if (otherMonth) cell.classList.add("other-month");
  if (date.getDay() === 0) cell.classList.add("sunday");
  if (date.getDay() === 6) cell.classList.add("saturday");

  const today = new Date();
  if (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  ) {
    cell.classList.add("today");
  }

  const number = document.createElement("div");
  number.className = "day-number";
  number.textContent = date.getDate();
  cell.appendChild(number);

  const eventsBox = document.createElement("div");
  eventsBox.className = "calendar-event-list";
  cell.appendChild(eventsBox);

  cell.addEventListener("click", () => {
    if (didRangeDrag) {
      didRangeDrag = false;
      return;
    }

    clearTimeout(clickTimer);
    clickTimer = setTimeout(() => openDayPanel(date), 220);
  });

  cell.addEventListener("dblclick", async (event) => {
    event.preventDefault();
    clearTimeout(clickTimer);
    const title = window.prompt(`${formatDateKey(date)} 일정 이름`);
    if (!title?.trim()) return;
    await createEvent(title.trim(), formatDateKey(date), formatDateKey(date), "");
    renderCalendar();
  });

  cell.addEventListener("mousedown", (event) => {
    if (event.button !== 0) return;
    dragStartDate = cell.dataset.date;
    dragCurrentDate = cell.dataset.date;
    didRangeDrag = false;
  });

  cell.addEventListener("mouseenter", () => {
    if (!dragStartDate) return;
    dragCurrentDate = cell.dataset.date;
    if (dragCurrentDate !== dragStartDate) {
      didRangeDrag = true;
      paintDragRange(dragStartDate, dragCurrentDate);
    }
  });

  calendarGrid.appendChild(cell);
}

document.addEventListener("mouseup", async () => {
  if (!dragStartDate) return;

  const start = dragStartDate;
  const end = dragCurrentDate || dragStartDate;
  clearDragRange();

  dragStartDate = null;
  dragCurrentDate = null;

  if (!didRangeDrag || start === end) return;

  const ordered = [start, end].sort();
  const title = window.prompt(`${ordered[0]} ~ ${ordered[1]} 일정 이름`);

  if (title?.trim()) {
    await createEvent(title.trim(), ordered[0], ordered[1], "");
    renderCalendar();
  }
});

function paintDragRange(a, b) {
  const [start, end] = [a, b].sort();
  document.querySelectorAll(".calendar-day").forEach((cell) => {
    cell.classList.toggle(
      "drag-range",
      cell.dataset.date >= start && cell.dataset.date <= end
    );
  });
}

function clearDragRange() {
  document.querySelectorAll(".calendar-day.drag-range").forEach((cell) =>
    cell.classList.remove("drag-range")
  );
}

prevMonthButton.addEventListener("click", () => {
  currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
  renderCalendar();
});

nextMonthButton.addEventListener("click", () => {
  currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
  renderCalendar();
});

/* CALENDAR EXTRAS */
async function loadCalendarExtras(year, monthIndex) {
  const visibleCells = [...document.querySelectorAll(".calendar-day")];
  if (!visibleCells.length) return;

  const start = visibleCells[0].dataset.date;
  const end = visibleCells[visibleCells.length - 1].dataset.date;

  const [moodsResult, eventsResult, periodsResult, decoResult] = await Promise.all([
    supabaseClient.from("moods").select("*").gte("record_date", start).lte("record_date", end),
    supabaseClient.from("events").select("*").lte("start_date", end).gte("end_date", start),
    supabaseClient.from("period_records").select("*").lte("start_date", end).or(`end_date.is.null,end_date.gte.${start}`),
    supabaseClient.from("day_decorations").select("*,stickers(*)").gte("record_date", start).lte("record_date", end)
  ]);

  const moodMap = new Map((moodsResult.data || []).map(x => [x.record_date, x]));
  const decosByDate = new Map();

  (decoResult.data || []).forEach((x) => {
    if (!decosByDate.has(x.record_date)) decosByDate.set(x.record_date, []);
    decosByDate.get(x.record_date).push(x);
  });

  visibleCells.forEach((cell) => {
    const key = cell.dataset.date;

    const mood = moodMap.get(key);
    if (mood) renderMoodBadgeOnCell(cell, mood);

    const events = (eventsResult.data || []).filter(e => e.start_date <= key && e.end_date >= key);
    const eventsBox = cell.querySelector(".calendar-event-list");
    events.slice(0, 3).forEach((event) => {
      const chip = document.createElement("div");
      chip.className = "calendar-event-chip";
      chip.textContent = event.title;
      eventsBox.appendChild(chip);
    });

    const period = (periodsResult.data || []).some(p => {
      const endDate = p.end_date || end;
      return p.start_date <= key && endDate >= key;
    });

    if (period) {
      const mark = document.createElement("div");
      mark.className = "calendar-period-mark";
      cell.appendChild(mark);
    }

    const decos = decosByDate.get(key) || [];
    if (decos.length) {
      const wrap = document.createElement("div");
      wrap.className = "calendar-decoration-wrap";

      decos.slice(0, 2).forEach((deco) => {
        const img = document.createElement("img");
        img.className = `calendar-decoration ${deco.decoration_type === "image" ? "photo" : ""}`;
        img.src = deco.decoration_type === "sticker" ? deco.stickers?.image_url : deco.image_url;
        if (img.src) wrap.appendChild(img);
      });

      cell.appendChild(wrap);
    }
  });
}

function renderMoodBadgeOnCell(cell, mood) {
  const badge = badgeSettings.find(b => b.category === "mood" && b.value === mood.mood_type);
  const moodMeta = MOODS.find(m => m.value === mood.mood_type);

  const el = document.createElement("div");
  el.className = "calendar-mood";
  el.title = mood.reason || moodMeta?.label || mood.mood_type;

  if (badge?.image_url) {
    const img = document.createElement("img");
    img.src = badge.image_url;
    el.appendChild(img);
  } else {
    el.textContent = moodMeta?.fallback || "•";
  }

  cell.appendChild(el);
}

/* MONTHLY SUMMARY */
async function loadMonthlyGoalSummary(year, monthIndex) {
  goalSummaryList.innerHTML = '<p class="empty-text">통계를 불러오는 중이에요.</p>';

  const start = `${year}-${String(monthIndex + 1).padStart(2, "0")}-01`;
  const next = new Date(year, monthIndex + 1, 1);
  const end = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`;

  const [goalsResult, recordsResult] = await Promise.all([
    supabaseClient.from("goals").select("*").eq("is_active", true).order("sort_order").order("created_at"),
    supabaseClient.from("daily_goal_records").select("*").gte("record_date", start).lt("record_date", end)
  ]);

  if (goalsResult.error || recordsResult.error) {
    goalSummaryList.innerHTML = '<p class="error-text">통계를 불러오지 못했어요.</p>';
    return;
  }

  renderMonthlyGoalSummary(goalsResult.data || [], recordsResult.data || []);
}

function renderMonthlyGoalSummary(activeGoals, records) {
  goalSummaryList.innerHTML = "";

  if (!activeGoals.length) {
    goalSummaryList.innerHTML = '<p class="empty-text">어드민에서 목표를 추가해주세요.</p>';
    return;
  }

  const labels = { success:"성공", effort:"노력", holiday:"휴일", fail:"실패" };

  activeGoals.forEach((goal) => {
    const counts = { success:0, effort:0, holiday:0, fail:0 };

    records.filter(r => r.goal_id === goal.id).forEach(r => {
      if (counts[r.status] !== undefined) counts[r.status]++;
    });

    const total = Object.values(counts).reduce((a,b) => a+b, 0);

    const card = document.createElement("div");
    card.className = "goal-summary-item";

    const heading = document.createElement("div");
    heading.className = "goal-summary-item-heading";
    heading.innerHTML = `<strong></strong><span>${total ? `${total}일 기록` : "아직 기록 없음"}</span>`;
    heading.querySelector("strong").textContent = goal.name;

    const bar = document.createElement("div");
    bar.className = "goal-stat-bar";

    Object.keys(counts).forEach(status => {
      const segment = document.createElement("div");
      segment.className = `goal-stat-segment stat-${status}`;
      segment.style.width = `${total ? counts[status] / total * 100 : 0}%`;
      bar.appendChild(segment);
    });

    const legend = document.createElement("div");
    legend.className = "goal-stat-legend";

    Object.keys(counts).forEach(status => {
      const p = total ? Math.round(counts[status] / total * 100) : 0;
      const item = document.createElement("span");
      item.className = "goal-stat-legend-item";
      item.innerHTML = `<i class="legend-dot stat-${status}"></i>${labels[status]} ${p}%`;
      legend.appendChild(item);
    });

    card.append(heading, bar, legend);
    goalSummaryList.appendChild(card);
  });
}

/* DAY PANEL */
async function openDayPanel(date) {
  const key = formatDateKey(date);

  if (dayPanel.classList.contains("open") && selectedRecordDate === key) {
    closeDayPanel();
    return;
  }

  selectedRecordDate = key;
  const weekdays = ["일요일","월요일","화요일","수요일","목요일","금요일","토요일"];
  selectedDateTitle.textContent = `${date.getFullYear()}. ${date.getMonth()+1}. ${date.getDate()}. ${weekdays[date.getDay()]}`;
  dayPanel.classList.add("open");

  await Promise.all([
    loadDailyGoalRecords(key),
    loadDayTodos(key),
    loadMood(key),
    loadPeriodState(key),
    loadDayDecorations(key),
    loadDayEvents(key)
  ]);
}

function closeDayPanel() {
  dayPanel.classList.remove("open");
}

closeDayPanelButton.addEventListener("click", closeDayPanel);

/* DAILY GOALS */
async function loadDailyGoalRecords(date) {
  dailyGoalRecordList.innerHTML = '<p class="empty-text">불러오는 중...</p>';

  const [goalsResult, recordsResult] = await Promise.all([
    supabaseClient.from("goals").select("*").eq("is_active", true).order("sort_order").order("created_at"),
    supabaseClient.from("daily_goal_records").select("*").eq("record_date", date)
  ]);

  const active = goalsResult.data || [];
  const map = new Map((recordsResult.data || []).map(r => [r.goal_id, r]));
  dailyGoalRecordList.innerHTML = "";

  if (!active.length) {
    dailyGoalRecordList.innerHTML = '<p class="empty-text">등록된 목표가 없어요.</p>';
    return;
  }

  active.forEach((goal) => {
    const row = document.createElement("div");
    row.className = "daily-goal-row";

    const info = document.createElement("div");
    info.className = "daily-goal-info";
    const name = document.createElement("strong");
    name.textContent = goal.name;
    info.appendChild(name);

    if (goal.description) {
      const desc = document.createElement("span");
      desc.textContent = goal.description;
      info.appendChild(desc);
    }

    const badgeImg = document.createElement("img");
    badgeImg.className = "goal-badge-preview hidden";

    const select = document.createElement("select");
    select.className = "goal-status-select";
    select.innerHTML = '<option value="">미기록</option>';

    GOAL_STATUSES.forEach(s => {
      const option = document.createElement("option");
      option.value = s.value;
      option.textContent = s.label;
      select.appendChild(option);
    });

    select.value = map.get(goal.id)?.status || "";
    applyGoalStatusClass(select);
    updateGoalBadgePreview(badgeImg, select.value);

    select.addEventListener("change", async () => {
      applyGoalStatusClass(select);
      updateGoalBadgePreview(badgeImg, select.value);
      await saveDailyGoalRecord(goal.id, select.value, select);
    });

    row.append(info, badgeImg, select);
    dailyGoalRecordList.appendChild(row);
  });
}

function applyGoalStatusClass(select) {
  select.classList.remove("status-success","status-effort","status-holiday","status-fail");
  if (select.value) select.classList.add(`status-${select.value}`);
}

function updateGoalBadgePreview(img, status) {
  const badge = badgeSettings.find(b => b.category === "goal_status" && b.value === status);
  if (badge?.image_url) {
    img.src = badge.image_url;
    img.classList.remove("hidden");
  } else {
    img.classList.add("hidden");
  }
}

async function saveDailyGoalRecord(goalId, status, select) {
  select.disabled = true;
  goalRecordSaveState.textContent = "저장 중...";

  let result;

  if (!status) {
    result = await supabaseClient.from("daily_goal_records")
      .delete().eq("record_date", selectedRecordDate).eq("goal_id", goalId);
  } else {
    result = await supabaseClient.from("daily_goal_records")
      .upsert({ record_date:selectedRecordDate, goal_id:goalId, status }, { onConflict:"record_date,goal_id" });
  }

  select.disabled = false;
  goalRecordSaveState.textContent = result.error ? "저장 실패" : "저장됨";

  if (!result.error) {
    loadMonthlyGoalSummary(currentDate.getFullYear(), currentDate.getMonth());
    setTimeout(() => goalRecordSaveState.textContent = "", 1000);
  }
}

/* DAY TODOS */
dayTodoForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const title = dayTodoInput.value.trim();
  if (!title || !selectedRecordDate) return;

  const { error } = await supabaseClient.from("todos").insert({
    title,
    target_date: selectedRecordDate,
    is_completed: false
  });

  if (!error) {
    dayTodoInput.value = "";
    loadDayTodos(selectedRecordDate);
  }
});

async function loadDayTodos(date) {
  const [todosResult, quickResult] = await Promise.all([
    supabaseClient.from("todos").select("*").eq("target_date", date).order("created_at"),
    supabaseClient.from("quick_todos").select("*").eq("is_completed", true)
      .gte("completed_at", `${date}T00:00:00`)
      .lt("completed_at", `${formatDateKey(new Date(parseLocalDate(date).getTime() + 86400000))}T00:00:00`)
      .order("completed_at")
  ]);

  dayTodoList.innerHTML = "";

  (todosResult.data || []).forEach(todo => {
    const row = document.createElement("div");
    row.className = `todo-row ${todo.is_completed ? "done" : ""}`;

    const check = document.createElement("input");
    check.type = "checkbox";
    check.checked = todo.is_completed;
    check.addEventListener("change", async () => {
      await supabaseClient.from("todos").update({
        is_completed: check.checked,
        completed_at: check.checked ? new Date().toISOString() : null
      }).eq("id", todo.id);
      loadDayTodos(date);
    });

    const text = document.createElement("span");
    text.textContent = todo.title;

    const del = document.createElement("button");
    del.className = "row-delete";
    del.textContent = "×";
    del.addEventListener("click", async () => {
      await supabaseClient.from("todos").delete().eq("id", todo.id);
      loadDayTodos(date);
    });

    row.append(check, text, del);
    dayTodoList.appendChild(row);
  });

  if (!(todosResult.data || []).length) {
    dayTodoList.innerHTML = '<p class="empty-text">등록된 할 일이 없어요.</p>';
  }

  completedQuickOnDate.innerHTML = "";
  const quicks = quickResult.data || [];

  if (quicks.length) {
    const h = document.createElement("h4");
    h.textContent = "이날 완료한 QUICK TODO";
    completedQuickOnDate.appendChild(h);

    quicks.forEach(q => {
      const chip = document.createElement("div");
      chip.className = "completed-quick-chip";
      chip.textContent = `✓ ${q.title}`;
      completedQuickOnDate.appendChild(chip);
    });
  }
}

/* QUICK TODOS */
quickTodoAddButton.addEventListener("click", addQuickTodo);
quickTodoInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") addQuickTodo();
});

async function addQuickTodo() {
  const title = quickTodoInput.value.trim();
  if (!title) return;

  const { error } = await supabaseClient.from("quick_todos").insert({
    title,
    is_completed:false
  });

  if (!error) {
    quickTodoInput.value = "";
    loadQuickTodos();
  }
}

async function loadQuickTodos() {
  const { data, error } = await supabaseClient.from("quick_todos").select("*").order("created_at");
  if (error) return;

  const active = (data || []).filter(x => !x.is_completed);
  const completed = (data || []).filter(x => x.is_completed).sort((a,b) => new Date(b.completed_at) - new Date(a.completed_at));

  quickTodoList.innerHTML = "";

  if (!active.length) {
    quickTodoList.innerHTML = '<p class="empty-text">아직 등록된 할 일이 없어요.</p>';
  } else {
    active.forEach(item => quickTodoList.appendChild(makeQuickTodoRow(item, false)));
  }

  quickTodoCompletedList.innerHTML = "";

  if (!completed.length) {
    quickTodoCompletedList.innerHTML = '<p class="empty-text">완료 기록이 없어요.</p>';
  } else {
    completed.forEach(item => quickTodoCompletedList.appendChild(makeQuickTodoRow(item, true)));
  }
}

function makeQuickTodoRow(item, completed) {
  const row = document.createElement("div");
  row.className = "quick-item";

  const check = document.createElement("input");
  check.type = "checkbox";
  check.checked = completed;

  check.addEventListener("change", async () => {
    await supabaseClient.from("quick_todos").update({
      is_completed: check.checked,
      completed_at: check.checked ? new Date().toISOString() : null
    }).eq("id", item.id);

    loadQuickTodos();

    if (selectedRecordDate) loadDayTodos(selectedRecordDate);
  });

  const text = document.createElement("span");
  text.textContent = item.title;

  row.append(check, text);

  if (completed) {
    const time = document.createElement("span");
    time.className = "quick-item-time";
    time.textContent = formatDateTime(item.completed_at);
    row.appendChild(time);
  }

  return row;
}

quickTodoMoreButton.addEventListener("click", () => quickTodoHistory.classList.toggle("hidden"));
quickHistoryClose.addEventListener("click", () => quickTodoHistory.classList.add("hidden"));

/* MOOD */
async function loadMood(date) {
  const { data } = await supabaseClient.from("moods").select("*").eq("record_date", date).maybeSingle();
  moodSelect.value = data?.mood_type || "";
  moodReason.value = data?.reason || "";
  moodSaveState.textContent = "";
}

moodSaveButton.addEventListener("click", async () => {
  if (!selectedRecordDate) return;

  moodSaveState.textContent = "저장 중...";

  let result;

  if (!moodSelect.value) {
    result = await supabaseClient.from("moods").delete().eq("record_date", selectedRecordDate);
  } else {
    result = await supabaseClient.from("moods").upsert({
      record_date:selectedRecordDate,
      mood_type:moodSelect.value,
      reason:moodReason.value.trim() || null
    }, { onConflict:"record_date" });
  }

  moodSaveState.textContent = result.error ? "저장 실패" : "저장됨";

  if (!result.error) {
    renderCalendar();
    setTimeout(() => moodSaveState.textContent = "", 1000);
  }
});

/* PERIOD */
async function loadPeriodState(date) {
  currentPeriodRecordId = null;
  const { data } = await supabaseClient.from("period_records").select("*").order("start_date", { ascending:false });

  const records = data || [];
  const covering = records.find(p => p.start_date <= date && (!p.end_date || p.end_date >= date));
  const open = records.find(p => !p.end_date);

  periodDeleteButton.classList.add("hidden");

  if (covering) {
    currentPeriodRecordId = covering.id;
    periodStateText.textContent = covering.end_date
      ? `${covering.start_date} ~ ${covering.end_date}`
      : `${covering.start_date}부터 진행 중`;
    periodDeleteButton.classList.remove("hidden");
  } else if (open) {
    periodStateText.textContent = `${open.start_date}부터 진행 중`;
  } else {
    periodStateText.textContent = "이 날짜의 생리 기록이 없어요.";
  }
}

periodStartButton.addEventListener("click", async () => {
  if (!selectedRecordDate) return;

  const { error } = await supabaseClient.from("period_records").insert({
    start_date:selectedRecordDate,
    end_date:null
  });

  if (error) {
    alert("이미 진행 중인 기록이 있거나 저장에 실패했어요.");
    return;
  }

  loadPeriodState(selectedRecordDate);
  renderCalendar();
});

periodEndButton.addEventListener("click", async () => {
  if (!selectedRecordDate) return;

  const { data } = await supabaseClient.from("period_records")
    .select("*").is("end_date", null).order("start_date", { ascending:false }).limit(1);

  const open = data?.[0];

  if (!open) {
    alert("종료할 진행 중 기록이 없어요.");
    return;
  }

  if (selectedRecordDate < open.start_date) {
    alert("시작일보다 앞선 날짜로 종료할 수 없어요.");
    return;
  }

  await supabaseClient.from("period_records").update({ end_date:selectedRecordDate }).eq("id", open.id);
  loadPeriodState(selectedRecordDate);
  renderCalendar();
});

periodDeleteButton.addEventListener("click", async () => {
  if (!currentPeriodRecordId) return;
  if (!confirm("이 생리 기록을 삭제할까요?")) return;
  await supabaseClient.from("period_records").delete().eq("id", currentPeriodRecordId);
  loadPeriodState(selectedRecordDate);
  renderCalendar();
});

/* DECORATIONS */
async function loadStickers() {
  const { data } = await supabaseClient.from("stickers").select("*").order("created_at");
  stickers = data || [];
  renderStickerSelect();
  renderStickerAdminList();
}

function renderStickerSelect() {
  dayStickerSelect.innerHTML = '<option value="">스티커 선택</option>';

  stickers.forEach(s => {
    const option = document.createElement("option");
    option.value = s.id;
    option.textContent = s.name;
    dayStickerSelect.appendChild(option);
  });
}

addStickerToDayButton.addEventListener("click", async () => {
  if (!selectedRecordDate || !dayStickerSelect.value) return;

  await supabaseClient.from("day_decorations").insert({
    record_date:selectedRecordDate,
    decoration_type:"sticker",
    sticker_id:Number(dayStickerSelect.value),
    position_x:50,
    position_y:50,
    scale:1
  });

  dayStickerSelect.value = "";
  loadDayDecorations(selectedRecordDate);
  renderCalendar();
});

dayImageInput.addEventListener("change", async () => {
  const file = dayImageInput.files?.[0];
  if (!file || !selectedRecordDate) return;

  const image = await readAndCompressImage(file, 800, .76);

  await supabaseClient.from("day_decorations").insert({
    record_date:selectedRecordDate,
    decoration_type:"image",
    image_url:image,
    position_x:50,
    position_y:50,
    scale:1
  });

  dayImageInput.value = "";
  loadDayDecorations(selectedRecordDate);
  renderCalendar();
});

async function loadDayDecorations(date) {
  const { data } = await supabaseClient.from("day_decorations").select("*,stickers(*)").eq("record_date", date).order("created_at");
  dayDecorationList.innerHTML = "";

  (data || []).forEach(deco => {
    const row = document.createElement("div");
    row.className = "decoration-row";

    const img = document.createElement("img");
    img.className = `decoration-thumb ${deco.decoration_type === "image" ? "photo" : ""}`;
    img.src = deco.decoration_type === "sticker" ? deco.stickers?.image_url : deco.image_url;

    const text = document.createElement("span");
    text.textContent = deco.decoration_type === "sticker" ? (deco.stickers?.name || "스티커") : "사진";

    const del = document.createElement("button");
    del.className = "row-delete";
    del.textContent = "×";
    del.addEventListener("click", async () => {
      await supabaseClient.from("day_decorations").delete().eq("id", deco.id);
      loadDayDecorations(date);
      renderCalendar();
    });

    row.append(img, text, del);
    dayDecorationList.appendChild(row);
  });

  if (!(data || []).length) {
    dayDecorationList.innerHTML = '<p class="empty-text">붙인 이미지가 없어요.</p>';
  }
}

/* EVENTS */
async function createEvent(title, start, end, description) {
  return supabaseClient.from("events").insert({
    title,
    start_date:start,
    end_date:end,
    description:description || null
  });
}

dayEventForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const title = dayEventInput.value.trim();
  if (!title || !selectedRecordDate) return;

  const { error } = await createEvent(title, selectedRecordDate, selectedRecordDate, "");
  if (!error) {
    dayEventInput.value = "";
    loadDayEvents(selectedRecordDate);
    renderCalendar();
  }
});

async function loadDayEvents(date) {
  const { data } = await supabaseClient.from("events").select("*")
    .lte("start_date", date).gte("end_date", date).order("start_date");

  dayEventList.innerHTML = "";

  (data || []).forEach(event => {
    const row = document.createElement("div");
    row.className = "side-event-row";

    const text = document.createElement("span");
    text.textContent = event.start_date === event.end_date
      ? event.title
      : `${event.title} · ${niceDate(event.start_date)}~${niceDate(event.end_date)}`;

    const del = document.createElement("button");
    del.className = "row-delete";
    del.textContent = "×";
    del.addEventListener("click", async () => {
      await supabaseClient.from("events").delete().eq("id", event.id);
      loadDayEvents(date);
      renderCalendar();
    });

    row.append(text, del);
    dayEventList.appendChild(row);
  });

  if (!(data || []).length) {
    dayEventList.innerHTML = '<p class="empty-text">일정이 없어요.</p>';
  }
}

/* SCHEDULE PAGE */
function setScheduleDefaults() {
  const today = formatDateKey(new Date());
  if (!scheduleStart.value) scheduleStart.value = today;
  if (!scheduleEnd.value) scheduleEnd.value = today;
}

scheduleStart.addEventListener("change", () => {
  if (!scheduleEnd.value || scheduleEnd.value < scheduleStart.value) {
    scheduleEnd.value = scheduleStart.value;
  }
});

scheduleForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (scheduleEnd.value < scheduleStart.value) {
    scheduleMessage.textContent = "종료일은 시작일보다 빠를 수 없어요.";
    return;
  }

  const { error } = await createEvent(
    scheduleTitle.value.trim(),
    scheduleStart.value,
    scheduleEnd.value,
    scheduleDescription.value.trim()
  );

  if (error) {
    scheduleMessage.textContent = "저장하지 못했어요.";
    return;
  }

  scheduleMessage.textContent = "저장했어요.";
  scheduleTitle.value = "";
  scheduleDescription.value = "";
  loadSchedulePage();
  renderCalendar();
});

async function loadSchedulePage() {
  const { data } = await supabaseClient.from("events").select("*").order("start_date").order("created_at");
  scheduleList.innerHTML = "";

  (data || []).forEach(event => {
    const row = document.createElement("div");
    row.className = "schedule-item";

    const date = document.createElement("div");
    date.className = "schedule-date";
    date.textContent = event.start_date === event.end_date
      ? event.start_date
      : `${event.start_date} → ${event.end_date}`;

    const text = document.createElement("div");
    text.className = "schedule-text";
    const strong = document.createElement("strong");
    strong.textContent = event.title;
    text.appendChild(strong);

    if (event.description) {
      const desc = document.createElement("span");
      desc.textContent = event.description;
      text.appendChild(desc);
    }

    const del = document.createElement("button");
    del.className = "danger-button";
    del.textContent = "삭제";
    del.addEventListener("click", async () => {
      if (!confirm(`"${event.title}" 일정을 삭제할까요?`)) return;
      await supabaseClient.from("events").delete().eq("id", event.id);
      loadSchedulePage();
      renderCalendar();
    });

    row.append(date, text, del);
    scheduleList.appendChild(row);
  });

  if (!(data || []).length) {
    scheduleList.innerHTML = '<p class="empty-text">등록된 일정이 없어요.</p>';
  }
}

/* GOALS ADMIN */
async function loadGoals() {
  const { data, error } = await supabaseClient.from("goals").select("*").order("sort_order").order("created_at");

  if (error) {
    goalList.innerHTML = '<p class="error-text">목표를 불러오지 못했어요.</p>';
    return;
  }

  goals = data || [];
  renderGoalList();
}

function renderGoalList() {
  goalList.innerHTML = "";

  if (!goals.length) {
    goalList.innerHTML = '<p class="empty-text">아직 등록된 목표가 없어요.</p>';
    return;
  }

  goals.forEach(goal => {
    const item = document.createElement("div");
    item.className = "goal-item";
    item.draggable = true;
    item.dataset.goalId = goal.id;

    const handle = document.createElement("div");
    handle.className = "goal-drag-handle";
    handle.textContent = "⋮⋮";

    const text = document.createElement("div");
    text.className = "goal-item-text";
    const name = document.createElement("strong");
    name.textContent = goal.name;
    text.appendChild(name);

    if (goal.description) {
      const desc = document.createElement("span");
      desc.textContent = goal.description;
      text.appendChild(desc);
    }

    const actions = document.createElement("div");
    actions.className = "goal-actions";

    const edit = document.createElement("button");
    edit.className = "secondary-button";
    edit.textContent = "수정";
    edit.addEventListener("click", () => startGoalEdit(goal));

    const del = document.createElement("button");
    del.className = "danger-button";
    del.textContent = "삭제";
    del.addEventListener("click", () => deleteGoal(goal));

    actions.append(edit, del);
    item.append(handle, text, actions);

    item.addEventListener("dragstart", handleGoalDragStart);
    item.addEventListener("dragover", handleGoalDragOver);
    item.addEventListener("drop", handleGoalDrop);
    item.addEventListener("dragend", handleGoalDragEnd);

    goalList.appendChild(item);
  });
}

goalForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const name = goalNameInput.value.trim();
  const description = goalDescriptionInput.value.trim();
  if (!name) return;

  let result;

  if (editingGoalId) {
    result = await supabaseClient.from("goals").update({
      name,
      description:description || null
    }).eq("id", editingGoalId);
  } else {
    const nextOrder = goals.length ? Math.max(...goals.map(g => Number(g.sort_order) || 0)) + 1 : 0;
    result = await supabaseClient.from("goals").insert({
      name,
      description:description || null,
      sort_order:nextOrder,
      is_active:true
    });
  }

  if (result.error) {
    goalMessage.textContent = "저장하지 못했어요.";
    return;
  }

  editingGoalId = null;
  goalForm.reset();
  goalSubmitButton.textContent = "목표 추가";
  goalMessage.textContent = "저장했어요.";
  loadGoals();
});

function startGoalEdit(goal) {
  editingGoalId = goal.id;
  goalNameInput.value = goal.name;
  goalDescriptionInput.value = goal.description || "";
  goalSubmitButton.textContent = "수정 저장";
}

async function deleteGoal(goal) {
  if (!confirm(`"${goal.name}" 목표를 삭제할까요?\n이 목표의 날짜 기록도 함께 삭제됩니다.`)) return;
  await supabaseClient.from("goals").delete().eq("id", goal.id);
  loadGoals();
}

let draggedGoalId = null;

function handleGoalDragStart(event) {
  draggedGoalId = Number(event.currentTarget.dataset.goalId);
  event.currentTarget.classList.add("dragging");
  event.dataTransfer.effectAllowed = "move";
}

function handleGoalDragOver(event) {
  event.preventDefault();
  const target = event.currentTarget;
  if (Number(target.dataset.goalId) === draggedGoalId) return;

  const dragged = goalList.querySelector(`[data-goal-id="${draggedGoalId}"]`);
  if (!dragged) return;

  const rect = target.getBoundingClientRect();
  if (event.clientY > rect.top + rect.height / 2) target.after(dragged);
  else target.before(dragged);
}

async function handleGoalDrop(event) {
  event.preventDefault();
  const ids = [...goalList.querySelectorAll(".goal-item")].map(x => Number(x.dataset.goalId));

  const results = await Promise.all(ids.map((id, i) =>
    supabaseClient.from("goals").update({ sort_order:i }).eq("id", id)
  ));

  goalMessage.textContent = results.some(x => x.error) ? "순서 저장 실패" : "순서를 저장했어요.";
  loadGoals();
}

function handleGoalDragEnd() {
  document.querySelectorAll(".goal-item").forEach(x => x.classList.remove("dragging"));
  draggedGoalId = null;
}

/* STICKER ADMIN */
stickerForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const file = stickerFileInput.files?.[0];
  const name = stickerNameInput.value.trim();
  if (!file || !name) return;

  stickerMessage.textContent = "이미지 처리 중...";

  const image = await readAndCompressImage(file, 480, .82);
  const { error } = await supabaseClient.from("stickers").insert({
    name,
    image_url:image
  });

  stickerMessage.textContent = error ? "저장 실패" : "저장했어요.";

  if (!error) {
    stickerForm.reset();
    loadStickers();
  }
});

function renderStickerAdminList() {
  if (!stickerAdminList) return;
  stickerAdminList.innerHTML = "";

  stickers.forEach(s => {
    const item = document.createElement("div");
    item.className = "sticker-admin-item";

    const img = document.createElement("img");
    img.src = s.image_url;

    const name = document.createElement("span");
    name.textContent = s.name;

    const del = document.createElement("button");
    del.textContent = "삭제";
    del.addEventListener("click", async () => {
      if (!confirm(`"${s.name}" 스티커를 삭제할까요?`)) return;
      await supabaseClient.from("stickers").delete().eq("id", s.id);
      loadStickers();
      if (selectedRecordDate) loadDayDecorations(selectedRecordDate);
      renderCalendar();
    });

    item.append(img, name, del);
    stickerAdminList.appendChild(item);
  });

  if (!stickers.length) {
    stickerAdminList.innerHTML = '<p class="empty-text">등록된 스티커가 없어요.</p>';
  }
}

/* BADGE ADMIN */
async function loadBadgeSettings() {
  const { data } = await supabaseClient.from("badge_settings").select("*");
  badgeSettings = data || [];
}

function renderBadgeAdmin() {
  badgeAdminList.innerHTML = "";

  const items = [
    ...GOAL_STATUSES.map(x => ({ category:"goal_status", ...x, fallback:"○" })),
    ...MOODS.map(x => ({ category:"mood", ...x }))
  ];

  items.forEach(meta => {
    const setting = badgeSettings.find(b => b.category === meta.category && b.value === meta.value);
    const item = document.createElement("div");
    item.className = "badge-admin-item";

    const preview = document.createElement("div");
    preview.className = "badge-preview";

    if (setting?.image_url) {
      const img = document.createElement("img");
      img.src = setting.image_url;
      preview.appendChild(img);
    } else {
      preview.textContent = meta.fallback || "○";
    }

    const info = document.createElement("div");
    info.className = "badge-admin-meta";

    const title = document.createElement("strong");
    title.textContent = `${meta.category === "goal_status" ? "목표" : "기분"} · ${meta.label}`;

    const label = document.createElement("label");
    label.textContent = setting?.image_url ? "이미지 변경" : "이미지 등록";

    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";

    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;

      const image = await readAndCompressImage(file, 300, .84);

      await supabaseClient.from("badge_settings").upsert({
        category:meta.category,
        value:meta.value,
        label:meta.label,
        image_url:image
      }, { onConflict:"category,value" });

      await loadBadgeSettings();
      renderBadgeAdmin();
      renderCalendar();
    });

    label.appendChild(input);
    info.append(title, label);

    if (setting?.image_url) {
      const clear = document.createElement("button");
      clear.textContent = "이미지 제거";
      clear.addEventListener("click", async () => {
        await supabaseClient.from("badge_settings").upsert({
          category:meta.category,
          value:meta.value,
          label:meta.label,
          image_url:null
        }, { onConflict:"category,value" });

        await loadBadgeSettings();
        renderBadgeAdmin();
        renderCalendar();
      });

      info.appendChild(clear);
    }

    item.append(preview, info);
    badgeAdminList.appendChild(item);
  });
}

/* SITE LOCK */
async function getSiteLockSetting() {
  const { data } = await supabaseClient.from("site_settings")
    .select("*").eq("setting_key", "site_lock").maybeSingle();

  return data?.setting_value || { enabled:false };
}

async function applySiteLockIfNeeded() {
  const setting = await getSiteLockSetting();

  if (
    setting.enabled &&
    setting.pin_hash &&
    sessionStorage.getItem("siteLockUnlocked") !== setting.pin_hash
  ) {
    siteLockScreen.classList.remove("hidden");
    siteLockPinInput.value = "";
    setTimeout(() => siteLockPinInput.focus(), 50);
  } else {
    siteLockScreen.classList.add("hidden");
  }
}

siteLockForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const setting = await getSiteLockSetting();
  const hash = await sha256(siteLockPinInput.value);

  if (hash !== setting.pin_hash) {
    siteLockMessage.textContent = "PIN이 맞지 않아요.";
    return;
  }

  sessionStorage.setItem("siteLockUnlocked", hash);
  siteLockMessage.textContent = "";
  siteLockScreen.classList.add("hidden");
});

async function loadSiteLockAdmin() {
  const setting = await getSiteLockSetting();
  siteLockEnabled.checked = Boolean(setting.enabled);
  siteLockAdminPin.value = "";
}

siteLockSaveButton.addEventListener("click", async () => {
  const old = await getSiteLockSetting();
  let hash = old.pin_hash || null;

  if (siteLockAdminPin.value) {
    hash = await sha256(siteLockAdminPin.value);
  }

  if (siteLockEnabled.checked && !hash) {
    siteLockAdminMessage.textContent = "잠금을 켜려면 PIN을 입력해주세요.";
    return;
  }

  const { error } = await supabaseClient.from("site_settings").upsert({
    setting_key:"site_lock",
    setting_value:{
      enabled:siteLockEnabled.checked,
      pin_hash:hash
    }
  }, { onConflict:"setting_key" });

  if (error) {
    siteLockAdminMessage.textContent = "저장하지 못했어요.";
    return;
  }

  siteLockAdminMessage.textContent = "저장했어요.";
  siteLockAdminPin.value = "";
  sessionStorage.removeItem("siteLockUnlocked");

  if (siteLockEnabled.checked) {
    await applySiteLockIfNeeded();
  }
});

/* SEARCH */
searchButton.addEventListener("click", () => {
  searchModal.classList.remove("hidden");
  searchInput.value = "";
  searchResults.innerHTML = '<p class="empty-text">검색어를 입력해주세요.</p>';
  setTimeout(() => searchInput.focus(), 50);
});

searchCloseButton.addEventListener("click", () => searchModal.classList.add("hidden"));

searchModal.addEventListener("click", (event) => {
  if (event.target === searchModal) searchModal.classList.add("hidden");
});

let searchDebounce = null;

searchInput.addEventListener("input", () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(runSearch, 180);
});

async function runSearch() {
  const q = searchInput.value.trim().toLowerCase();

  if (!q) {
    searchResults.innerHTML = '<p class="empty-text">검색어를 입력해주세요.</p>';
    return;
  }

  searchResults.innerHTML = '<p class="empty-text">검색 중...</p>';

  const [g, t, qt, e, m] = await Promise.all([
    supabaseClient.from("goals").select("*"),
    supabaseClient.from("todos").select("*"),
    supabaseClient.from("quick_todos").select("*"),
    supabaseClient.from("events").select("*"),
    supabaseClient.from("moods").select("*")
  ]);

  const results = [];

  (g.data || []).forEach(x => {
    const text = `${x.name} ${x.description || ""}`.toLowerCase();
    if (text.includes(q)) results.push({ type:"목표", date:"", title:x.name, body:x.description || "" });
  });

  (t.data || []).forEach(x => {
    if (x.title.toLowerCase().includes(q)) results.push({ type:"할 일", date:x.target_date || "", title:x.title, body:x.is_completed ? "완료" : "미완료" });
  });

  (qt.data || []).forEach(x => {
    if (x.title.toLowerCase().includes(q)) results.push({ type:"QUICK TODO", date:x.completed_at ? x.completed_at.slice(0,10) : "", title:x.title, body:x.is_completed ? "완료" : "진행 중" });
  });

  (e.data || []).forEach(x => {
    const text = `${x.title} ${x.description || ""}`.toLowerCase();
    if (text.includes(q)) results.push({ type:"일정", date:x.start_date === x.end_date ? x.start_date : `${x.start_date} ~ ${x.end_date}`, title:x.title, body:x.description || "" });
  });

  (m.data || []).forEach(x => {
    if ((x.reason || "").toLowerCase().includes(q)) {
      const label = MOODS.find(m => m.value === x.mood_type)?.label || x.mood_type;
      results.push({ type:"기분", date:x.record_date, title:label, body:x.reason || "" });
    }
  });

  renderSearchResults(results);
}

function renderSearchResults(items) {
  searchResults.innerHTML = "";

  if (!items.length) {
    searchResults.innerHTML = '<p class="empty-text">검색 결과가 없어요.</p>';
    return;
  }

  items.slice(0, 100).forEach(item => {
    const row = document.createElement("div");
    row.className = "search-result";

    const head = document.createElement("strong");
    head.textContent = item.type + (item.date ? ` · ${item.date}` : "");

    const title = document.createElement("p");
    title.textContent = item.title;

    row.append(head, title);

    if (item.body) {
      const body = document.createElement("span");
      body.textContent = item.body;
      row.appendChild(body);
    }

    searchResults.appendChild(row);
  });
}

/* START */
checkSession();
