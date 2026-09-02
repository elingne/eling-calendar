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
let isOwner = false;
let decorationLayers = [];
let selectedDecorationLayerId = null;

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
const quickTodoHistory = $("quickTodoHistory");
const quickTodoCompletedList = $("quickTodoCompletedList");

const dayTodoForm = $("dayTodoForm");
const dayTodoInput = $("dayTodoInput");
const dayTodoList = $("dayTodoList");
const completedQuickOnDate = $("completedQuickOnDate");

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

const moodSelect = $("moodSelect");
const periodCheck = $("periodCheck");
const quickMetaSaveState = $("quickMetaSaveState");

const openDecorationEditorButton = $("openDecorationEditorButton");
const decorationSidePreview = $("decorationSidePreview");
const decorationEditorModal = $("decorationEditorModal");
const decorationEditorCloseButton = $("decorationEditorCloseButton");
const decorationEditorSaveButton = $("decorationEditorSaveButton");
const decorationEditorTitle = $("decorationEditorTitle");
const decorationCanvas = $("decorationCanvas");
const decoCanvasDate = $("decoCanvasDate");
const decoImageFileInput = $("decoImageFileInput");
const decoStickerSelect = $("decoStickerSelect");
const decoAddStickerButton = $("decoAddStickerButton");
const decoScaleRange = $("decoScaleRange");
const layerList = $("layerList");
const decorationViewerModal = $("decorationViewerModal");
const decorationViewerCloseButton = $("decorationViewerCloseButton");
const decorationViewerCanvas = $("decorationViewerCanvas");

const openScheduleCreateButton = $("openScheduleCreateButton");
const scheduleList = $("scheduleList");

const eventModal = $("eventModal");
const eventModalTitle = $("eventModalTitle");
const eventModalCloseButton = $("eventModalCloseButton");
const eventModalForm = $("eventModalForm");
const eventIdInput = $("eventIdInput");
const eventTitleInput = $("eventTitleInput");
const eventStartInput = $("eventStartInput");
const eventEndInput = $("eventEndInput");
const eventDescriptionInput = $("eventDescriptionInput");
const eventDeleteButton = $("eventDeleteButton");
const eventCancelButton = $("eventCancelButton");
const eventModalMessage = $("eventModalMessage");

const sitePublicToggle = $("sitePublicToggle");
const sitePublicLabel = $("sitePublicLabel");
const sitePublicSaveButton = $("sitePublicSaveButton");
const sitePublicMessage = $("sitePublicMessage");

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
  }

  currentSession = data?.session || null;
  isOwner = Boolean(currentSession);

  if (isOwner) {
    await showSite();
    return;
  }

  const publicMode = await isSitePublic();

  if (publicMode) {
    await showSite();
  } else {
    showLogin();
  }
}

async function isSitePublic() {
  const { data, error } = await supabaseClient
    .from("site_settings")
    .select("setting_value")
    .eq("setting_key", "site_visibility")
    .maybeSingle();

  if (error) return false;
  return Boolean(data?.setting_value?.public);
}

function applyAccessMode() {
  document.body.classList.toggle("read-only", !isOwner);

  const adminButton = navButtons.find(button => button.dataset.page === "admin");
  if (adminButton) adminButton.classList.toggle("hidden", !isOwner);

  logoutButton.textContent = isOwner ? "로그아웃" : "관리자 로그인";
}

function showLogin() {
  loginScreen.classList.remove("hidden");
  siteApp.classList.add("hidden");
  dayPanel.classList.remove("open");
}

async function showSite() {
  loginScreen.classList.add("hidden");
  siteApp.classList.remove("hidden");

  clearQuickTodoAutofill();
  applyAccessMode();

  await loadStickers();

  showPage("calendar");
  renderCalendar();

  if (isOwner) {
    loadQuickTodos();
  } else {
    loadQuickTodos();
  }
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
  isOwner = true;
  loginPassword.value = "";
  await showSite();
});

logoutButton.addEventListener("click", async () => {
  if (!isOwner) {
    showLogin();
    return;
  }

  await supabaseClient.auth.signOut();
  currentSession = null;
  isOwner = false;

  const publicMode = await isSitePublic();
  if (publicMode) await showSite();
  else showLogin();
});

supabaseClient.auth.onAuthStateChange((event, session) => {
  currentSession = session;
  isOwner = Boolean(session);
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
    loadSchedulePage();
  }

  if (page === "admin" && isOwner) {
    await Promise.all([
      loadGoals(),
      loadStickers(),
      loadSiteVisibilityAdmin()
    ]);
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

  cell.addEventListener("dblclick", (event) => {
    event.preventDefault();
    clearTimeout(clickTimer);

    if (!isOwner) return;

    const key = formatDateKey(date);
    openEventModal({
      start_date: key,
      end_date: key
    });
  });

  cell.addEventListener("mousedown", (event) => {
    if (!isOwner || event.button !== 0) return;
    if (event.target.closest(".calendar-event-chip") || event.target.closest(".calendar-deco-composite")) return;

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

document.addEventListener("mouseup", () => {
  if (!dragStartDate) return;

  const start = dragStartDate;
  const end = dragCurrentDate || dragStartDate;
  clearDragRange();

  dragStartDate = null;
  dragCurrentDate = null;

  if (!didRangeDrag || start === end || !isOwner) return;

  const ordered = [start, end].sort();
  openEventModal({
    start_date: ordered[0],
    end_date: ordered[1]
  });
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
async function loadCalendarExtras() {
  const visibleCells = [...document.querySelectorAll(".calendar-day")];
  if (!visibleCells.length) return;

  const start = visibleCells[0].dataset.date;
  const end = visibleCells[visibleCells.length - 1].dataset.date;

  const [moodsResult, eventsResult, periodsResult, decoResult] = await Promise.all([
    supabaseClient.from("moods").select("*").gte("record_date", start).lte("record_date", end),
    supabaseClient.from("events").select("*").lte("start_date", end).gte("end_date", start),
    supabaseClient.from("period_records").select("*").lte("start_date", end).gte("end_date", start),
    supabaseClient.from("day_decorations").select("*,stickers(*)").gte("record_date", start).lte("record_date", end)
  ]);

  const moods = moodsResult.data || [];
  const events = eventsResult.data || [];
  const periods = periodsResult.data || [];
  const decos = decoResult.data || [];

  visibleCells.forEach((cell) => {
    const key = cell.dataset.date;

    const badgeWrap = document.createElement("div");
    badgeWrap.className = "calendar-top-badges";

    const mood = moods.find(item => item.record_date === key);
    if (mood) {
      const meta = MOODS.find(item => item.value === mood.mood_type);
      if (meta) {
        const badge = document.createElement("span");
        badge.className = "calendar-simple-badge mood-badge";
        badge.textContent = meta.fallback;
        badgeWrap.appendChild(badge);
      }
    }

    const periodOn = periods.some(item =>
      item.start_date <= key && item.end_date >= key
    );

    if (periodOn) {
      const badge = document.createElement("span");
      badge.className = "calendar-simple-badge period-drop";
      badge.textContent = "💧";
      badge.title = "생리";
      badgeWrap.appendChild(badge);
    }

    if (badgeWrap.children.length) {
      cell.appendChild(badgeWrap);
    }

    const eventBox = cell.querySelector(".calendar-event-list");
    events
      .filter(event => event.start_date <= key && event.end_date >= key)
      .slice(0, 3)
      .forEach(event => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "calendar-event-chip";
        chip.textContent = event.title;

        chip.addEventListener("click", (clickEvent) => {
          clickEvent.stopPropagation();
          openEventModal(event, true);
        });

        eventBox.appendChild(chip);
      });

    const dateDecos = decos
      .filter(item => item.record_date === key)
      .sort((a, b) => (a.z_order || 0) - (b.z_order || 0));

    if (dateDecos.length) {
      const composite = buildDecorationComposite(dateDecos, "calendar");
      composite.classList.add("calendar-deco-composite");
      composite.title = "클릭해서 크게 보기";

      composite.addEventListener("click", (clickEvent) => {
        clickEvent.stopPropagation();
        openDecorationViewer(dateDecos, key);
      });

      cell.appendChild(composite);
    }
  });
}

function buildDecorationComposite(layers, mode = "calendar") {
  const wrap = document.createElement("div");
  wrap.className = `deco-composite deco-composite-${mode}`;

  layers.forEach((layer, index) => {
    const img = document.createElement("img");
    img.className = "deco-composite-layer";
    img.src = layer.decoration_type === "sticker"
      ? layer.stickers?.image_url
      : layer.image_url;

    if (!img.src) return;

    img.style.left = `${layer.position_x ?? 50}%`;
    img.style.top = `${layer.position_y ?? 50}%`;
    img.style.transform = `translate(-50%, -50%) scale(${layer.scale ?? 1})`;
    img.style.zIndex = String(layer.z_order ?? index);
    wrap.appendChild(img);
  });

  return wrap;
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
    loadQuickDateMeta(key),
    loadDecorationSidePreview(key)
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
    select.disabled = !isOwner;
    applyGoalStatusClass(select);

    select.addEventListener("change", async () => {
      applyGoalStatusClass(select);
      await saveDailyGoalRecord(goal.id, select.value, select);
    });

    row.append(info, select);
    dailyGoalRecordList.appendChild(row);
  });
}

function applyGoalStatusClass(select) {
  select.classList.remove("status-success","status-effort","status-holiday","status-fail");
  if (select.value) select.classList.add(`status-${select.value}`);
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
  if (!isOwner) return;
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
    check.disabled = !isOwner;
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
    del.className = `row-delete ${isOwner ? "" : "hidden"}`;
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

function clearQuickTodoAutofill() {
  if (!quickTodoInput) return;

  quickTodoInput.value = "";

  // Some browsers/password managers inject remembered account text
  // shortly after page restore, so clear it once more after rendering.
  window.setTimeout(() => {
    if (document.activeElement !== quickTodoInput) {
      quickTodoInput.value = "";
    }
  }, 120);
}

/* QUICK TODOS */
quickTodoAddButton.addEventListener("click", addQuickTodo);
quickTodoInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") addQuickTodo();
});

async function addQuickTodo() {
  if (!isOwner) return;
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
  row.className = `quick-item ${completed ? "quick-item-completed" : ""}`;

  const check = document.createElement("input");
  check.type = "checkbox";
  check.checked = completed;
  check.disabled = !isOwner;
  check.title = completed ? "체크 해제하면 다시 해야 하는 일로 돌아가요." : "완료";

  check.addEventListener("change", async () => {
    const { error } = await supabaseClient.from("quick_todos").update({
      is_completed: check.checked,
      completed_at: check.checked ? new Date().toISOString() : null
    }).eq("id", item.id);

    if (error) {
      console.error("QUICK TODO 상태 변경 오류:", error);
      check.checked = !check.checked;
      return;
    }

    await loadQuickTodos();

    if (selectedRecordDate) {
      await loadDayTodos(selectedRecordDate);
    }
  });

  const content = document.createElement("div");
  content.className = "quick-item-content";

  const text = document.createElement("span");
  text.className = "quick-item-title";
  text.textContent = item.title;
  content.appendChild(text);

  if (completed && item.completed_at) {
    const time = document.createElement("span");
    time.className = "quick-item-time";
    time.textContent = formatDateTime(item.completed_at);
    content.appendChild(time);
  }

  const actions = document.createElement("div");
  actions.className = "quick-item-actions";

  const editButton = document.createElement("button");
  editButton.type = "button";
  editButton.className = "quick-edit-button";
  editButton.textContent = "수정";

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "quick-delete-button";
  deleteButton.textContent = "×";
  deleteButton.title = "삭제";
  deleteButton.setAttribute("aria-label", `${item.title} 삭제`);

  editButton.addEventListener("click", () => {
    if (row.classList.contains("editing")) return;

    row.classList.add("editing");
    check.disabled = true;
    editButton.classList.add("hidden");
    deleteButton.classList.add("hidden");

    const originalTitle = item.title;

    const editor = document.createElement("div");
    editor.className = "quick-inline-editor";

    const input = document.createElement("input");
    input.type = "text";
    input.className = "quick-inline-input";
    input.value = originalTitle;
    input.maxLength = 120;
    input.autocomplete = "off";

    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.className = "quick-inline-save";
    saveButton.textContent = "저장";

    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.className = "quick-inline-cancel";
    cancelButton.textContent = "취소";

    const finishEditing = () => {
      row.classList.remove("editing");
      check.disabled = false;
      editButton.classList.remove("hidden");
      deleteButton.classList.remove("hidden");
      editor.remove();
      content.classList.remove("hidden");
    };

    const saveEditing = async () => {
      const nextTitle = input.value.trim();

      if (!nextTitle) {
        input.focus();
        return;
      }

      saveButton.disabled = true;

      const { error } = await supabaseClient
        .from("quick_todos")
        .update({ title: nextTitle })
        .eq("id", item.id);

      if (error) {
        console.error("QUICK TODO 수정 오류:", error);
        saveButton.disabled = false;
        return;
      }

      await loadQuickTodos();

      if (selectedRecordDate) {
        await loadDayTodos(selectedRecordDate);
      }
    };

    saveButton.addEventListener("click", saveEditing);
    cancelButton.addEventListener("click", finishEditing);

    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        saveEditing();
      }

      if (event.key === "Escape") {
        event.preventDefault();
        finishEditing();
      }
    });

    editor.append(input, saveButton, cancelButton);
    content.classList.add("hidden");
    row.insertBefore(editor, actions);

    input.focus();
    input.select();
  });

  deleteButton.addEventListener("click", async () => {
    if (!window.confirm(`"${item.title}"을(를) 삭제할까요?`)) return;

    const { error } = await supabaseClient
      .from("quick_todos")
      .delete()
      .eq("id", item.id);

    if (error) {
      console.error("QUICK TODO 삭제 오류:", error);
      return;
    }

    await loadQuickTodos();

    if (selectedRecordDate) {
      await loadDayTodos(selectedRecordDate);
    }
  });

  actions.append(editButton, deleteButton);
  if (!isOwner) actions.classList.add("hidden");
  row.append(check, content, actions);

  return row;
}

/* DATE META: MOOD + PERIOD */
async function loadQuickDateMeta(date) {
  quickMetaSaveState.textContent = "";

  const [moodResult, periodResult] = await Promise.all([
    supabaseClient.from("moods").select("*").eq("record_date", date).maybeSingle(),
    supabaseClient.from("period_records").select("*").eq("start_date", date).eq("end_date", date).maybeSingle()
  ]);

  moodSelect.value = moodResult.data?.mood_type || "";
  periodCheck.checked = Boolean(periodResult.data);

  moodSelect.disabled = !isOwner;
  periodCheck.disabled = !isOwner;
}

moodSelect.addEventListener("change", async () => {
  if (!isOwner || !selectedRecordDate) return;

  quickMetaSaveState.textContent = "저장 중...";

  let result;

  if (!moodSelect.value) {
    result = await supabaseClient
      .from("moods")
      .delete()
      .eq("record_date", selectedRecordDate);
  } else {
    result = await supabaseClient
      .from("moods")
      .upsert({
        record_date: selectedRecordDate,
        mood_type: moodSelect.value,
        reason: null
      }, { onConflict: "record_date" });
  }

  quickMetaSaveState.textContent = result.error ? "저장 실패" : "저장됨";

  if (!result.error) {
    renderCalendar();
    window.setTimeout(() => quickMetaSaveState.textContent = "", 800);
  }
});

periodCheck.addEventListener("change", async () => {
  if (!isOwner || !selectedRecordDate) return;

  quickMetaSaveState.textContent = "저장 중...";

  let result;

  if (periodCheck.checked) {
    result = await supabaseClient.from("period_records").insert({
      start_date: selectedRecordDate,
      end_date: selectedRecordDate
    });
  } else {
    result = await supabaseClient
      .from("period_records")
      .delete()
      .eq("start_date", selectedRecordDate)
      .eq("end_date", selectedRecordDate);
  }

  quickMetaSaveState.textContent = result.error ? "저장 실패" : "저장됨";

  if (result.error) {
    periodCheck.checked = !periodCheck.checked;
  } else {
    renderCalendar();
    window.setTimeout(() => quickMetaSaveState.textContent = "", 800);
  }
});

/* DECORATION EDITOR */
async function loadDecorationSidePreview(date) {
  const layers = await fetchDecorationLayers(date);
  decorationSidePreview.innerHTML = "";

  if (!layers.length) {
    decorationSidePreview.innerHTML = '<p class="empty-text">꾸민 이미지가 없어요.</p>';
    return;
  }

  const composite = buildDecorationComposite(layers, "side");
  composite.addEventListener("click", () => openDecorationViewer(layers, date));
  decorationSidePreview.appendChild(composite);
}

async function fetchDecorationLayers(date) {
  const { data } = await supabaseClient
    .from("day_decorations")
    .select("*,stickers(*)")
    .eq("record_date", date)
    .order("z_order", { ascending: true })
    .order("created_at", { ascending: true });

  return data || [];
}

openDecorationEditorButton.addEventListener("click", async () => {
  if (!isOwner || !selectedRecordDate) return;

  decorationLayers = await fetchDecorationLayers(selectedRecordDate);
  decorationEditorTitle.textContent = `${selectedRecordDate} 다꾸`;
  decoCanvasDate.textContent = selectedRecordDate;
  selectedDecorationLayerId = decorationLayers.at(-1)?.id || null;

  renderDecorationEditor();
  decorationEditorModal.classList.remove("hidden");
});

decorationEditorCloseButton.addEventListener("click", closeDecorationEditor);

function closeDecorationEditor() {
  decorationEditorModal.classList.add("hidden");
  decorationLayers = [];
  selectedDecorationLayerId = null;
}

function renderDecorationEditor() {
  decorationCanvas.querySelectorAll(".deco-edit-layer").forEach(node => node.remove());

  decorationLayers
    .sort((a, b) => (a.z_order || 0) - (b.z_order || 0))
    .forEach((layer, index) => {
      layer.z_order = index;

      const img = document.createElement("img");
      img.className = "deco-edit-layer";
      if (layer.id === selectedDecorationLayerId) img.classList.add("selected");

      img.dataset.layerId = layer.id;
      img.src = layer.decoration_type === "sticker"
        ? layer.stickers?.image_url
        : layer.image_url;

      img.style.left = `${layer.position_x ?? 50}%`;
      img.style.top = `${layer.position_y ?? 50}%`;
      img.style.transform = `translate(-50%, -50%) scale(${layer.scale ?? 1})`;
      img.style.zIndex = String(index + 1);

      enableDecorationDrag(img, layer);
      img.addEventListener("pointerdown", () => selectDecorationLayer(layer.id));

      decorationCanvas.appendChild(img);
    });

  renderLayerList();
  syncDecorationScaleControl();
}

function enableDecorationDrag(element, layer) {
  element.addEventListener("pointerdown", (event) => {
    if (!isOwner) return;

    event.preventDefault();
    element.setPointerCapture(event.pointerId);

    const rect = decorationCanvas.getBoundingClientRect();

    const move = (moveEvent) => {
      const x = Math.max(0, Math.min(100, ((moveEvent.clientX - rect.left) / rect.width) * 100));
      const y = Math.max(0, Math.min(100, ((moveEvent.clientY - rect.top) / rect.height) * 100));

      layer.position_x = x;
      layer.position_y = y;
      element.style.left = `${x}%`;
      element.style.top = `${y}%`;
    };

    const up = () => {
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerup", up);
    };

    element.addEventListener("pointermove", move);
    element.addEventListener("pointerup", up);
  });
}

function selectDecorationLayer(id) {
  selectedDecorationLayerId = id;
  renderDecorationEditor();
}

function syncDecorationScaleControl() {
  const selected = decorationLayers.find(layer => layer.id === selectedDecorationLayerId);
  decoScaleRange.disabled = !selected;
  decoScaleRange.value = selected?.scale ?? 1;
}

decoScaleRange.addEventListener("input", () => {
  const selected = decorationLayers.find(layer => layer.id === selectedDecorationLayerId);
  if (!selected) return;

  selected.scale = Number(decoScaleRange.value);

  const element = decorationCanvas.querySelector(`[data-layer-id="${selected.id}"]`);
  if (element) {
    element.style.transform = `translate(-50%, -50%) scale(${selected.scale})`;
  }
});

function renderLayerList() {
  layerList.innerHTML = "";

  [...decorationLayers]
    .sort((a, b) => (b.z_order || 0) - (a.z_order || 0))
    .forEach(layer => {
      const item = document.createElement("div");
      item.className = "layer-item";
      item.draggable = true;
      item.dataset.layerId = layer.id;

      if (layer.id === selectedDecorationLayerId) {
        item.classList.add("selected");
      }

      const thumb = document.createElement("img");
      thumb.src = layer.decoration_type === "sticker"
        ? layer.stickers?.image_url
        : layer.image_url;

      const name = document.createElement("span");
      name.textContent = layer.decoration_type === "sticker"
        ? (layer.stickers?.name || "스티커")
        : "사진";

      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "×";
      remove.addEventListener("click", async (event) => {
        event.stopPropagation();

        if (String(layer.id).startsWith("temp-")) {
          decorationLayers = decorationLayers.filter(item => item.id !== layer.id);
        } else {
          await supabaseClient.from("day_decorations").delete().eq("id", layer.id);
          decorationLayers = decorationLayers.filter(item => item.id !== layer.id);
        }

        selectedDecorationLayerId = decorationLayers.at(-1)?.id || null;
        normalizeDecorationOrder();
        renderDecorationEditor();
      });

      item.addEventListener("click", () => selectDecorationLayer(layer.id));
      item.addEventListener("dragstart", event => {
        event.dataTransfer.setData("text/plain", String(layer.id));
      });
      item.addEventListener("dragover", event => event.preventDefault());
      item.addEventListener("drop", event => {
        event.preventDefault();

        const draggedId = event.dataTransfer.getData("text/plain");
        reorderDecorationLayers(draggedId, String(layer.id));
      });

      item.append(thumb, name, remove);
      layerList.appendChild(item);
    });
}

function reorderDecorationLayers(draggedId, targetId) {
  const orderedFrontFirst = [...decorationLayers]
    .sort((a, b) => (b.z_order || 0) - (a.z_order || 0));

  const from = orderedFrontFirst.findIndex(layer => String(layer.id) === String(draggedId));
  const to = orderedFrontFirst.findIndex(layer => String(layer.id) === String(targetId));

  if (from < 0 || to < 0 || from === to) return;

  const [moved] = orderedFrontFirst.splice(from, 1);
  orderedFrontFirst.splice(to, 0, moved);

  const backToFront = orderedFrontFirst.reverse();
  backToFront.forEach((layer, index) => layer.z_order = index);

  decorationLayers = backToFront;
  renderDecorationEditor();
}

function normalizeDecorationOrder() {
  decorationLayers
    .sort((a, b) => (a.z_order || 0) - (b.z_order || 0))
    .forEach((layer, index) => layer.z_order = index);
}

function renderStickerEditorOptions() {
  decoStickerSelect.innerHTML = '<option value="">스티커 선택</option>';

  stickers.forEach(sticker => {
    const option = document.createElement("option");
    option.value = sticker.id;
    option.textContent = sticker.name;
    decoStickerSelect.appendChild(option);
  });
}

decoAddStickerButton.addEventListener("click", () => {
  const sticker = stickers.find(item => String(item.id) === decoStickerSelect.value);
  if (!sticker) return;

  const tempId = `temp-${crypto.randomUUID()}`;

  decorationLayers.push({
    id: tempId,
    record_date: selectedRecordDate,
    decoration_type: "sticker",
    sticker_id: sticker.id,
    image_url: null,
    stickers: sticker,
    position_x: 50,
    position_y: 50,
    scale: 1,
    z_order: decorationLayers.length
  });

  selectedDecorationLayerId = tempId;
  decoStickerSelect.value = "";
  renderDecorationEditor();
});

decoImageFileInput.addEventListener("change", async () => {
  const file = decoImageFileInput.files?.[0];
  if (!file) return;

  const imageUrl = await readAndCompressImage(file, 1100, .82);
  const tempId = `temp-${crypto.randomUUID()}`;

  decorationLayers.push({
    id: tempId,
    record_date: selectedRecordDate,
    decoration_type: "image",
    sticker_id: null,
    image_url: imageUrl,
    stickers: null,
    position_x: 50,
    position_y: 50,
    scale: 1,
    z_order: decorationLayers.length
  });

  selectedDecorationLayerId = tempId;
  decoImageFileInput.value = "";
  renderDecorationEditor();
});

decorationEditorSaveButton.addEventListener("click", async () => {
  if (!isOwner || !selectedRecordDate) return;

  normalizeDecorationOrder();
  decorationEditorSaveButton.disabled = true;
  decorationEditorSaveButton.textContent = "저장 중...";

  for (const layer of decorationLayers) {
    const payload = {
      record_date: selectedRecordDate,
      decoration_type: layer.decoration_type,
      sticker_id: layer.sticker_id || null,
      image_url: layer.decoration_type === "image" ? layer.image_url : null,
      position_x: layer.position_x ?? 50,
      position_y: layer.position_y ?? 50,
      scale: layer.scale ?? 1,
      z_order: layer.z_order ?? 0
    };

    if (String(layer.id).startsWith("temp-")) {
      await supabaseClient.from("day_decorations").insert(payload);
    } else {
      await supabaseClient.from("day_decorations").update(payload).eq("id", layer.id);
    }
  }

  decorationEditorSaveButton.disabled = false;
  decorationEditorSaveButton.textContent = "완료";

  closeDecorationEditor();
  await loadDecorationSidePreview(selectedRecordDate);
  renderCalendar();
});

function openDecorationViewer(layers, date) {
  decorationViewerCanvas.innerHTML = "";

  const title = document.createElement("div");
  title.className = "viewer-date";
  title.textContent = date;

  const composite = buildDecorationComposite(layers, "viewer");

  decorationViewerCanvas.append(title, composite);
  decorationViewerModal.classList.remove("hidden");
}

decorationViewerCloseButton.addEventListener("click", () => {
  decorationViewerModal.classList.add("hidden");
});

/* EVENTS */
function openEventModal(eventData = {}, allowEdit = false) {
  const existing = Boolean(eventData.id);

  eventIdInput.value = eventData.id || "";
  eventTitleInput.value = eventData.title || "";
  eventStartInput.value = eventData.start_date || formatDateKey(new Date());
  eventEndInput.value = eventData.end_date || eventStartInput.value;
  eventDescriptionInput.value = eventData.description || "";
  eventModalMessage.textContent = "";

  const canEdit = isOwner;
  eventModalTitle.textContent = existing ? (canEdit ? "일정 수정" : "일정 보기") : "일정 추가";

  [eventTitleInput, eventStartInput, eventEndInput, eventDescriptionInput].forEach(input => {
    input.disabled = !canEdit;
  });

  eventDeleteButton.classList.toggle("hidden", !existing || !canEdit);
  eventModalForm.querySelector('button[type="submit"]').classList.toggle("hidden", !canEdit);

  eventModal.classList.remove("hidden");
}

function closeEventModal() {
  eventModal.classList.add("hidden");
  eventModalForm.reset();
  eventIdInput.value = "";
}

eventModalCloseButton.addEventListener("click", closeEventModal);
eventCancelButton.addEventListener("click", closeEventModal);

eventStartInput.addEventListener("change", () => {
  if (!eventEndInput.value || eventEndInput.value < eventStartInput.value) {
    eventEndInput.value = eventStartInput.value;
  }
});

eventModalForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (!isOwner) return;

  const payload = {
    title: eventTitleInput.value.trim(),
    start_date: eventStartInput.value,
    end_date: eventEndInput.value,
    description: eventDescriptionInput.value.trim() || null
  };

  if (!payload.title) return;

  if (payload.end_date < payload.start_date) {
    eventModalMessage.textContent = "종료일은 시작일보다 빠를 수 없어요.";
    return;
  }

  let result;

  if (eventIdInput.value) {
    result = await supabaseClient
      .from("events")
      .update(payload)
      .eq("id", Number(eventIdInput.value));
  } else {
    result = await supabaseClient
      .from("events")
      .insert(payload);
  }

  if (result.error) {
    eventModalMessage.textContent = "저장하지 못했어요.";
    return;
  }

  closeEventModal();
  loadSchedulePage();
  renderCalendar();
});

eventDeleteButton.addEventListener("click", async () => {
  if (!isOwner || !eventIdInput.value) return;
  if (!confirm("이 일정을 삭제할까요?")) return;

  await supabaseClient.from("events").delete().eq("id", Number(eventIdInput.value));

  closeEventModal();
  loadSchedulePage();
  renderCalendar();
});

openScheduleCreateButton.addEventListener("click", () => {
  if (!isOwner) return;
  openEventModal();
});

/* SCHEDULE PAGE */
async function loadSchedulePage() {
  const { data } = await supabaseClient
    .from("events")
    .select("*")
    .order("start_date")
    .order("created_at");

  scheduleList.innerHTML = "";

  (data || []).forEach(event => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "schedule-item schedule-item-button";

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

    row.addEventListener("click", () => openEventModal(event, true));
    row.append(date, text);
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

/* SITE VISIBILITY */
async function loadSiteVisibilityAdmin() {
  const { data } = await supabaseClient
    .from("site_settings")
    .select("setting_value")
    .eq("setting_key", "site_visibility")
    .maybeSingle();

  const publicMode = Boolean(data?.setting_value?.public);
  sitePublicToggle.checked = publicMode;
  sitePublicLabel.textContent = publicMode ? "전체 공개" : "비공개";
  sitePublicMessage.textContent = "";
}

sitePublicToggle.addEventListener("change", () => {
  sitePublicLabel.textContent = sitePublicToggle.checked ? "전체 공개" : "비공개";
});

sitePublicSaveButton.addEventListener("click", async () => {
  if (!isOwner) return;

  const { error } = await supabaseClient
    .from("site_settings")
    .upsert({
      setting_key: "site_visibility",
      setting_value: {
        public: sitePublicToggle.checked
      }
    }, { onConflict: "setting_key" });

  sitePublicMessage.textContent = error ? "저장하지 못했어요." : "저장했어요.";
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
clearQuickTodoAutofill();
checkSession();
