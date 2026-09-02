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
const logoHomeButton = $("logoHomeButton");
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
const stickerCountText = $("stickerCountText");

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
const openStickerPickerButton = $("openStickerPickerButton");
const stickerPickerModal = $("stickerPickerModal");
const stickerPickerCloseButton = $("stickerPickerCloseButton");
const stickerPickerGrid = $("stickerPickerGrid");
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

  await showPage("calendar");

  // 첫 진입 때 레이아웃 계산 전에 캘린더가 잘리는 브라우저 케이스 방지
  requestAnimationFrame(() => {
    renderCalendar();
    requestAnimationFrame(() => renderCalendar());
  });

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
logoHomeButton.addEventListener("click", () => {
  showPage("calendar");
  window.setTimeout(() => {
    renderCalendar();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, 0);
});

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

    renderStickerAdminList();
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

function moodSproutIcon(value) {
  if (value === "happy" || value === "great" || value === "good") return "🌱";
  if (value === "neutral") return "🌿";
  if (value === "bad" || value === "low") return "🥀";
  return "";
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
      badge.title = "생리";
      const drop = document.createElement("i");
      drop.className = "red-drop-icon";
      badge.appendChild(drop);
      badgeWrap.appendChild(badge);
    }

    if (badgeWrap.children.length) {
      cell.appendChild(badgeWrap);
    }

    const eventBox = cell.querySelector(".calendar-event-list");

    const orderedEvents = [...events].sort((a, b) =>
      a.start_date.localeCompare(b.start_date) ||
      b.end_date.localeCompare(a.end_date) ||
      a.id - b.id
    );

    // 같은 일정은 모든 날짜 칸에서 같은 세로 줄(row)을 사용해야 바가 정확히 이어진다.
    const cellEvents = orderedEvents
      .filter(event => event.start_date <= key && event.end_date >= key)
      .slice(0, 3);

    cellEvents.forEach((event, rowIndex) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "calendar-event-chip";
      chip.dataset.eventId = event.id;
      chip.style.setProperty("--event-row", rowIndex);

      const continuesLeft = event.start_date < key;
      const continuesRight = event.end_date > key;

      if (continuesLeft) chip.classList.add("event-continues-left");
      if (continuesRight) chip.classList.add("event-continues-right");

      chip.textContent = continuesLeft ? "" : event.title;
      chip.title = event.title;

      chip.addEventListener("click", clickEvent => {
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

  if (!layers.length) return wrap;

  const prepared = layers
    .map((layer, index) => ({
      ...layer,
      _src: layer.decoration_type === "sticker"
        ? layer.stickers?.image_url
        : layer.image_url,
      _z: layer.z_order ?? index
    }))
    .filter(layer => layer._src);

  if (!prepared.length) return wrap;

  // 실제 배치된 오브젝트 영역만 잡아 여백을 자동으로 잘라낸다.
  // 기본 레이어 크기는 편집 캔버스의 약 24%이고 scale이 곱해진다.
  const bounds = prepared.reduce((acc, layer) => {
    const baseHalf = 12 * Number(layer.scale ?? 1);
    const x = Number(layer.position_x ?? 50);
    const y = Number(layer.position_y ?? 50);

    acc.minX = Math.min(acc.minX, x - baseHalf);
    acc.maxX = Math.max(acc.maxX, x + baseHalf);
    acc.minY = Math.min(acc.minY, y - baseHalf);
    acc.maxY = Math.max(acc.maxY, y + baseHalf);
    return acc;
  }, { minX: 100, maxX: 0, minY: 100, maxY: 0 });

  const padding = mode === "calendar" ? 3 : 5;
  const minX = Math.max(0, bounds.minX - padding);
  const maxX = Math.min(100, bounds.maxX + padding);
  const minY = Math.max(0, bounds.minY - padding);
  const maxY = Math.min(100, bounds.maxY + padding);

  const width = Math.max(8, maxX - minX);
  const height = Math.max(8, maxY - minY);

  wrap.style.setProperty("--crop-width", width);
  wrap.style.setProperty("--crop-height", height);
  wrap.style.aspectRatio = `${width} / ${height}`;

  prepared
    .sort((a, b) => a._z - b._z)
    .forEach((layer, index) => {
      const img = document.createElement("img");
      img.className = "deco-composite-layer";
      img.src = layer._src;

      const normalizedX = ((Number(layer.position_x ?? 50) - minX) / width) * 100;
      const normalizedY = ((Number(layer.position_y ?? 50) - minY) / height) * 100;

      // 원래 캔버스 기준 24% 크기를 crop 폭/높이에 맞춰 재계산
      const objectWidthPct = (24 / width) * 100;
      const objectHeightPct = (24 / height) * 100;

      img.style.left = `${normalizedX}%`;
      img.style.top = `${normalizedY}%`;
      img.style.width = `${objectWidthPct}%`;
      img.style.height = `${objectHeightPct}%`;
      img.style.transform =
        `translate(-50%, -50%) scale(${layer.scale ?? 1}) rotate(${layer.rotation ?? 0}deg)`;
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

  const labels = {
    success: "성공",
    holiday: "휴일",
    fail: "실패"
  };

  const statuses = ["success", "holiday", "fail"];

  activeGoals.forEach((goal) => {
    const counts = {
      success: 0,
      holiday: 0,
      fail: 0
    };

    records
      .filter(record => record.goal_id === goal.id)
      .forEach(record => {
        if (Object.prototype.hasOwnProperty.call(counts, record.status)) {
          counts[record.status] += 1;
        }
      });

    const total = statuses.reduce((sum, status) => sum + counts[status], 0);

    const card = document.createElement("div");
    card.className = "goal-summary-item";

    const heading = document.createElement("div");
    heading.className = "goal-summary-item-heading";

    const goalName = document.createElement("strong");
    goalName.textContent = goal.name;

    const totalText = document.createElement("span");
    totalText.textContent = total ? `${total}일 기록` : "아직 기록 없음";

    heading.append(goalName, totalText);

    const bar = document.createElement("div");
    bar.className = "goal-stat-bar";

    statuses.forEach(status => {
      const segment = document.createElement("div");
      segment.className = `goal-stat-segment stat-${status}`;
      segment.style.width = `${total ? (counts[status] / total) * 100 : 0}%`;
      bar.appendChild(segment);
    });

    const legend = document.createElement("div");
    legend.className = "goal-stat-legend";

    statuses.forEach(status => {
      const percentage = total ? Math.round((counts[status] / total) * 100) : 0;

      const item = document.createElement("span");
      item.className = "goal-stat-legend-item";

      const dot = document.createElement("i");
      dot.className = `legend-dot stat-${status}`;

      const label = document.createTextNode(`${labels[status]} ${percentage}%`);

      item.append(dot, label);
      legend.appendChild(item);
    });

    card.append(heading, bar, legend);
    goalSummaryList.appendChild(card);
  });
}

const todoAccordionToggle = $("todoAccordionToggle");
const todoAccordionLabel = $("todoAccordionLabel");
const todoAccordionBody = $("todoAccordionBody");

function setTodoAccordion(open) {
  if (!todoAccordionToggle || !todoAccordionBody) return;

  todoAccordionToggle.setAttribute("aria-expanded", String(open));
  todoAccordionBody.classList.toggle("hidden", !open);
  todoAccordionToggle.classList.toggle("open", open);
}

todoAccordionToggle?.addEventListener("click", () => {
  const open = todoAccordionToggle.getAttribute("aria-expanded") !== "true";
  setTodoAccordion(open);
});

/* DAY PANEL */
async function openDayPanel(date) {
  const key = formatDateKey(date);

  if (dayPanel.classList.contains("open") && selectedRecordDate === key) {
    closeDayPanel();
    return;
  }

  selectedRecordDate = key;
  setTodoAccordion(false);

  if (todoAccordionLabel) {
    todoAccordionLabel.textContent = `${date.getMonth() + 1}월 ${date.getDate()}일에 완료한 일`;
  }

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
  event.preventDefault();

  if (!isOwner || !selectedRecordDate) return;

  const title = dayTodoInput.value.trim();
  if (!title) return;

  const completedAt = new Date(`${selectedRecordDate}T12:00:00`).toISOString();

  const { error } = await supabaseClient
    .from("todos")
    .insert({
      title,
      target_date: selectedRecordDate,
      is_completed: true,
      completed_at: completedAt
    });

  if (error) {
    console.error("한 일 추가 오류:", error);
    return;
  }

  dayTodoInput.value = "";
  await loadDayTodos(selectedRecordDate);
});
async function loadDayTodos(date) {
  const [todosResult, quickResult] = await Promise.all([
    supabaseClient
      .from("todos")
      .select("*")
      .eq("target_date", date)
      .order("created_at"),
    supabaseClient
      .from("quick_todos")
      .select("*")
      .eq("is_completed", true)
      .order("completed_at")
  ]);

  dayTodoList.innerHTML = "";

  const completedDayTodos = (todosResult.data || [])
    .filter(todo => todo.is_completed)
    .map(todo => ({
      table: "todos",
      id: todo.id,
      title: todo.title,
      completed_at: todo.completed_at || todo.created_at
    }));

  const completedQuickTodos = (quickResult.data || [])
    .filter(item =>
      item.completed_at &&
      formatDateKey(new Date(item.completed_at)) === date
    )
    .map(item => ({
      table: "quick_todos",
      id: item.id,
      title: item.title,
      completed_at: item.completed_at
    }));

  const completedItems = [...completedDayTodos, ...completedQuickTodos]
    .sort((a, b) => new Date(a.completed_at) - new Date(b.completed_at));

  if (!completedItems.length) {
    dayTodoList.innerHTML = '<p class="empty-text">아직 완료한 일이 없어요.</p>';
    return;
  }

  completedItems.forEach(item => {
    const row = document.createElement("div");
    row.className = "todo-row done completed-record-row unified-completed-row";

    const checkMark = document.createElement("span");
    checkMark.className = "completed-record-check";
    checkMark.textContent = "✓";

    const text = document.createElement("span");
    text.className = "completed-record-title";
    text.textContent = item.title;

    row.append(checkMark, text);

    if (isOwner) {
      const del = document.createElement("button");
      del.type = "button";
      del.className = "row-delete";
      del.textContent = "×";
      del.title = "완료 기록 삭제";
      del.setAttribute("aria-label", `${item.title} 삭제`);

      del.addEventListener("click", async () => {
        const { error } = await supabaseClient
          .from(item.table)
          .delete()
          .eq("id", item.id);

        if (error) {
          console.error("완료 기록 삭제 오류:", error);
          return;
        }

        await loadDayTodos(date);

        // QUICK TODO를 삭제했다면 메인 오늘 완료 목록에서도 즉시 사라지게 한다.
        if (item.table === "quick_todos") {
          await loadQuickTodos();
        }
      });

      row.appendChild(del);
    }

    dayTodoList.appendChild(row);
  });
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
  const { data, error } = await supabaseClient
    .from("quick_todos")
    .select("*")
    .order("created_at");

  if (error) {
    console.error("QUICK TODO 불러오기 오류:", error);
    return;
  }

  const rows = data || [];
  const todayKey = formatDateKey(new Date());

  const active = rows.filter(item => !item.is_completed);

  // 메인의 완료 목록은 '오늘 완료한 것'만 보여준다.
  // completed_at은 UTC로 저장되지만 Date로 변환한 뒤 브라우저 로컬 날짜를 기준으로 귀속한다.
  const completedToday = rows
    .filter(item =>
      item.is_completed &&
      item.completed_at &&
      formatDateKey(new Date(item.completed_at)) === todayKey
    )
    .sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at));

  quickTodoList.innerHTML = "";

  if (!active.length) {
    quickTodoList.innerHTML = '<p class="empty-text">아직 등록된 할 일이 없어요.</p>';
  } else {
    active.forEach(item => quickTodoList.appendChild(makeQuickTodoRow(item, false)));
  }

  quickTodoCompletedList.innerHTML = "";

  if (!completedToday.length) {
    quickTodoCompletedList.innerHTML = '<p class="empty-text">오늘 완료한 일이 없어요.</p>';
  } else {
    completedToday.forEach(item =>
      quickTodoCompletedList.appendChild(makeQuickTodoRow(item, true))
    );
  }

  lastQuickTodoDateKey = todayKey;
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

  const storedMood = moodResult.data?.mood_type || "";
  moodSelect.value =
    storedMood === "great" || storedMood === "good" ? "happy" :
    storedMood === "low" ? "bad" :
    storedMood;
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
  decorationCanvas.querySelectorAll(".deco-edit-item").forEach(node => node.remove());

  decorationLayers
    .sort((a, b) => (a.z_order || 0) - (b.z_order || 0))
    .forEach((layer, index) => {
      layer.z_order = index;
      if (layer.rotation === undefined || layer.rotation === null) layer.rotation = 0;

      const item = document.createElement("div");
      item.className = "deco-edit-item";
      item.dataset.layerId = layer.id;
      item.style.left = `${layer.position_x ?? 50}%`;
      item.style.top = `${layer.position_y ?? 50}%`;
      item.style.zIndex = String(index + 1);
      item.style.setProperty("--deco-scale", layer.scale ?? 1);
      item.style.setProperty("--deco-rotation", `${layer.rotation ?? 0}deg`);

      if (layer.id === selectedDecorationLayerId) item.classList.add("selected");

      const img = document.createElement("img");
      img.className = "deco-edit-layer";
      img.src = layer.decoration_type === "sticker"
        ? layer.stickers?.image_url
        : layer.image_url;
      img.draggable = false;

      if (!img.src) return;

      const resizeHandle = document.createElement("button");
      resizeHandle.type = "button";
      resizeHandle.className = "deco-resize-handle";
      resizeHandle.title = "드래그해서 크기 조절";

      const rotateHandle = document.createElement("button");
      rotateHandle.type = "button";
      rotateHandle.className = "deco-rotate-handle";
      rotateHandle.title = "드래그해서 회전";

      item.append(img, resizeHandle, rotateHandle);

      enableDecorationMove(item, layer);
      enableDecorationResize(resizeHandle, item, layer);
      enableDecorationRotate(rotateHandle, item, layer);

      item.addEventListener("pointerdown", event => {
        if (
          event.target.closest(".deco-resize-handle") ||
          event.target.closest(".deco-rotate-handle")
        ) return;

        selectDecorationLayer(layer.id, false);
      });

      decorationCanvas.appendChild(item);
    });

  renderLayerList();
}

function enableDecorationMove(element, layer) {
  element.addEventListener("pointerdown", event => {
    if (!isOwner) return;
    if (
      event.target.closest(".deco-resize-handle") ||
      event.target.closest(".deco-rotate-handle")
    ) return;

    event.preventDefault();
    selectDecorationLayer(layer.id, false);

    const rect = decorationCanvas.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const startPosX = Number(layer.position_x ?? 50);
    const startPosY = Number(layer.position_y ?? 50);

    element.setPointerCapture(event.pointerId);

    const move = moveEvent => {
      const dx = ((moveEvent.clientX - startX) / rect.width) * 100;
      const dy = ((moveEvent.clientY - startY) / rect.height) * 100;

      layer.position_x = Math.max(0, Math.min(100, startPosX + dx));
      layer.position_y = Math.max(0, Math.min(100, startPosY + dy));

      element.style.left = `${layer.position_x}%`;
      element.style.top = `${layer.position_y}%`;
    };

    const up = () => {
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerup", up);
      element.removeEventListener("pointercancel", up);
    };

    element.addEventListener("pointermove", move);
    element.addEventListener("pointerup", up);
    element.addEventListener("pointercancel", up);
  });
}

function enableDecorationResize(handle, element, layer) {
  handle.addEventListener("pointerdown", event => {
    if (!isOwner) return;

    event.preventDefault();
    event.stopPropagation();
    selectDecorationLayer(layer.id, false);

    const canvasRect = decorationCanvas.getBoundingClientRect();
    const centerX = canvasRect.left + (Number(layer.position_x ?? 50) / 100) * canvasRect.width;
    const centerY = canvasRect.top + (Number(layer.position_y ?? 50) / 100) * canvasRect.height;

    const startDistance = Math.max(
      1,
      Math.hypot(event.clientX - centerX, event.clientY - centerY)
    );
    const startScale = Number(layer.scale ?? 1);

    handle.setPointerCapture(event.pointerId);

    const move = moveEvent => {
      const distance = Math.hypot(moveEvent.clientX - centerX, moveEvent.clientY - centerY);
      layer.scale = Math.max(0.2, Math.min(3.5, startScale * (distance / startDistance)));
      element.style.setProperty("--deco-scale", layer.scale);
    };

    const up = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", up);
    };

    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", up);
  });
}

function enableDecorationRotate(handle, element, layer) {
  handle.addEventListener("pointerdown", event => {
    if (!isOwner) return;

    event.preventDefault();
    event.stopPropagation();
    selectDecorationLayer(layer.id, false);

    const canvasRect = decorationCanvas.getBoundingClientRect();
    const centerX = canvasRect.left + (Number(layer.position_x ?? 50) / 100) * canvasRect.width;
    const centerY = canvasRect.top + (Number(layer.position_y ?? 50) / 100) * canvasRect.height;

    handle.setPointerCapture(event.pointerId);

    const move = moveEvent => {
      const angle = Math.atan2(moveEvent.clientY - centerY, moveEvent.clientX - centerX) * 180 / Math.PI + 90;
      layer.rotation = Math.round(angle);
      element.style.setProperty("--deco-rotation", `${layer.rotation}deg`);
    };

    const up = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", up);
    };

    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", up);
  });
}

function selectDecorationLayer(id, rerender = true) {
  selectedDecorationLayerId = id;

  if (rerender) {
    renderDecorationEditor();
    return;
  }

  decorationCanvas.querySelectorAll(".deco-edit-item").forEach(item => {
    item.classList.toggle("selected", String(item.dataset.layerId) === String(id));
  });

  layerList.querySelectorAll(".layer-item").forEach(item => {
    item.classList.toggle("selected", String(item.dataset.layerId) === String(id));
  });
}

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

function renderStickerPicker() {
  if (!stickerPickerGrid) return;

  stickerPickerGrid.innerHTML = "";

  if (!stickers.length) {
    stickerPickerGrid.innerHTML = '<p class="empty-text">어드민에서 등록한 스티커가 없어요.</p>';
    return;
  }

  stickers.forEach(sticker => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "sticker-picker-card";

    const img = document.createElement("img");
    img.src = sticker.image_url;
    img.alt = sticker.name;

    const name = document.createElement("span");
    name.textContent = sticker.name;

    button.append(img, name);

    button.addEventListener("click", () => {
      addStickerLayer(sticker);
      stickerPickerModal.classList.add("hidden");
    });

    stickerPickerGrid.appendChild(button);
  });
}

openStickerPickerButton.addEventListener("click", () => {
  if (!isOwner) return;
  renderStickerPicker();
  stickerPickerModal.classList.remove("hidden");
});

stickerPickerCloseButton.addEventListener("click", () => {
  stickerPickerModal.classList.add("hidden");
});

stickerPickerModal.addEventListener("click", event => {
  if (event.target === stickerPickerModal) {
    stickerPickerModal.classList.add("hidden");
  }
});

function addStickerLayer(sticker) {
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
    rotation: 0,
    z_order: decorationLayers.length
  });

  selectedDecorationLayerId = tempId;
  renderDecorationEditor();
}

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
    rotation: 0,
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
      rotation: layer.rotation ?? 0,
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
  if (goalDescriptionInput) goalDescriptionInput.value = goal.description || "";
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

async function loadStickers() {
  const { data, error } = await supabaseClient
    .from("stickers")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("스티커 불러오기 오류:", error);

    if (stickerMessage) {
      stickerMessage.textContent = `스티커를 불러오지 못했어요: ${error.message}`;
    }

    return;
  }

  stickers = data || [];

  renderStickerAdminList();
  renderStickerPicker();
}

/* STICKER ADMIN */
stickerForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!isOwner) {
    stickerMessage.textContent = "관리자 로그인 상태에서만 등록할 수 있어요.";
    return;
  }

  const file = stickerFileInput.files?.[0];
  const name = stickerNameInput.value.trim();

  if (!name) {
    stickerMessage.textContent = "스티커 이름을 입력해주세요.";
    stickerNameInput.focus();
    return;
  }

  if (!file) {
    stickerMessage.textContent = "스티커 이미지를 선택해주세요.";
    return;
  }

  if (!file.type.startsWith("image/")) {
    stickerMessage.textContent = "이미지 파일만 등록할 수 있어요.";
    return;
  }

  const submitButton = stickerForm.querySelector('button[type="submit"]');

  try {
    submitButton.disabled = true;
    submitButton.textContent = "등록 중...";
    stickerMessage.textContent = "이미지를 처리하고 있어요...";

    // DB에 data URL을 저장하므로 스티커는 작게 압축해 용량을 줄인다.
    const image = await readAndCompressImage(file, 360, .72);

    const { error } = await supabaseClient
      .from("stickers")
      .insert({
        name,
        image_url: image
      });

    if (error) {
      console.error("스티커 등록 오류:", error);
      stickerMessage.textContent = `등록 실패: ${error.message}`;
      return;
    }

    stickerForm.reset();
    stickerMessage.textContent = "스티커를 등록했어요.";

    await loadStickers();

    window.setTimeout(() => {
      if (stickerMessage.textContent === "스티커를 등록했어요.") {
        stickerMessage.textContent = "";
      }
    }, 1600);
  } catch (error) {
    console.error("스티커 처리 오류:", error);
    stickerMessage.textContent = "이미지를 처리하지 못했어요. 다른 이미지로 다시 시도해주세요.";
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "스티커 추가";
  }
});

function renderStickerAdminList() {
  if (!stickerAdminList) return;

  stickerAdminList.innerHTML = "";
  if (stickerCountText) stickerCountText.textContent = `${stickers.length}개`;

  stickers.forEach(sticker => {
    const item = document.createElement("div");
    item.className = "sticker-admin-item sticker-admin-card";

    const imgWrap = document.createElement("div");
    imgWrap.className = "sticker-admin-thumb-wrap";

    const img = document.createElement("img");
    img.src = sticker.image_url;
    img.alt = sticker.name;
    img.loading = "lazy";
    imgWrap.appendChild(img);

    const name = document.createElement("span");
    name.className = "sticker-admin-name";
    name.textContent = sticker.name;

    const del = document.createElement("button");
    del.type = "button";
    del.className = "sticker-card-delete";
    del.textContent = "×";
    del.title = "삭제";

    del.addEventListener("click", async () => {
      const { error } = await supabaseClient
        .from("stickers")
        .delete()
        .eq("id", sticker.id);

      if (error) {
        stickerMessage.textContent = "삭제하지 못했어요.";
        return;
      }

      await loadStickers();

      if (selectedRecordDate) {
        await loadDecorationSidePreview(selectedRecordDate);
      }

      renderCalendar();
    });

    item.append(imgWrap, name, del);
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

sitePublicToggle.addEventListener("change", async () => {
  if (!isOwner) return;

  const nextPublic = sitePublicToggle.checked;
  sitePublicLabel.textContent = nextPublic ? "전체 공개" : "비공개";
  sitePublicMessage.textContent = "저장 중...";

  const { error } = await supabaseClient
    .from("site_settings")
    .upsert({
      setting_key: "site_visibility",
      setting_value: { public: nextPublic }
    }, { onConflict: "setting_key" });

  if (error) {
    sitePublicToggle.checked = !nextPublic;
    sitePublicLabel.textContent = sitePublicToggle.checked ? "전체 공개" : "비공개";
    sitePublicMessage.textContent = "저장하지 못했어요.";
    return;
  }

  sitePublicMessage.textContent = nextPublic ? "전체 공개로 변경했어요." : "비공개로 변경했어요.";
  window.setTimeout(() => sitePublicMessage.textContent = "", 1200);
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

window.addEventListener("pageshow", () => {
  if (!siteApp.classList.contains("hidden") && !calendarPage.classList.contains("hidden")) {
    requestAnimationFrame(() => renderCalendar());
  }
});

let calendarResizeTimer = null;
window.addEventListener("resize", () => {
  clearTimeout(calendarResizeTimer);
  calendarResizeTimer = setTimeout(() => {
    if (!calendarPage.classList.contains("hidden")) renderCalendar();
  }, 120);
});

let lastQuickTodoDateKey = formatDateKey(new Date());

function refreshQuickTodoOnDateChange() {
  const todayKey = formatDateKey(new Date());

  if (todayKey === lastQuickTodoDateKey) return;

  lastQuickTodoDateKey = todayKey;

  // 날짜가 넘어가면 메인 완료 목록은 새 날짜 기준으로 즉시 다시 그린다.
  if (!siteApp.classList.contains("hidden")) {
    loadQuickTodos();

    // 열려 있는 사이드탭은 기록 날짜 자체가 고정되어 있으므로 해당 날짜 기록을 유지한다.
    if (selectedRecordDate && dayPanel.classList.contains("open")) {
      loadDayTodos(selectedRecordDate);
    }
  }
}

window.setInterval(refreshQuickTodoOnDateChange, 60 * 1000);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) refreshQuickTodoOnDateChange();
});

/* START */
clearQuickTodoAutofill();
checkSession();
