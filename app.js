let currentDate = new Date();
let currentSession = null;
let goals = [];
let editingGoalId = null;
let selectedRecordDate = null;

const loginScreen = document.getElementById("loginScreen");
const siteApp = document.getElementById("siteApp");
const loginForm = document.getElementById("loginForm");
const loginEmail = document.getElementById("loginEmail");
const loginPassword = document.getElementById("loginPassword");
const loginButton = document.getElementById("loginButton");
const loginMessage = document.getElementById("loginMessage");
const logoutButton = document.getElementById("logoutButton");

const navButtons = [...document.querySelectorAll(".nav-button")];
const calendarPage = document.getElementById("calendarPage");
const schedulePage = document.getElementById("schedulePage");
const adminPage = document.getElementById("adminPage");

const calendarTitle = document.getElementById("calendarTitle");
const calendarGrid = document.getElementById("calendarGrid");
const goalSummaryList = document.getElementById("goalSummaryList");
const prevMonthButton = document.getElementById("prevMonth");
const nextMonthButton = document.getElementById("nextMonth");
const dayPanel = document.getElementById("dayPanel");
const closeDayPanelButton = document.getElementById("closeDayPanel");
const selectedDateTitle = document.getElementById("selectedDateTitle");
const dailyGoalRecordList = document.getElementById("dailyGoalRecordList");
const goalRecordSaveState = document.getElementById("goalRecordSaveState");

const goalForm = document.getElementById("goalForm");
const goalNameInput = document.getElementById("goalNameInput");
const goalDescriptionInput = document.getElementById("goalDescriptionInput");
const goalSubmitButton = document.getElementById("goalSubmitButton");
const goalMessage = document.getElementById("goalMessage");
const goalList = document.getElementById("goalList");

async function checkSession() {
  const { data, error } = await supabaseClient.auth.getSession();
  if (error) {
    console.error("세션 확인 오류:", error);
    showLogin();
    return;
  }
  currentSession = data.session;
  currentSession ? showSite() : showLogin();
}

function showLogin() {
  loginScreen.classList.remove("hidden");
  siteApp.classList.add("hidden");
  dayPanel.classList.remove("open");
}

function showSite() {
  loginScreen.classList.add("hidden");
  siteApp.classList.remove("hidden");
  showPage("calendar");
  renderCalendar();
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
    console.error("로그인 오류:", error);
    loginMessage.textContent = "이메일 또는 비밀번호를 확인해주세요.";
    return;
  }

  currentSession = data.session;
  loginPassword.value = "";
  showSite();
});

logoutButton.addEventListener("click", async () => {
  await supabaseClient.auth.signOut();
  currentSession = null;
  loginPassword.value = "";
  showLogin();
});

supabaseClient.auth.onAuthStateChange((event, session) => {
  currentSession = session;
  if (event === "SIGNED_OUT") showLogin();
});

navButtons.forEach((button) => {
  button.addEventListener("click", () => showPage(button.dataset.page));
});

async function showPage(page) {
  calendarPage.classList.toggle("hidden", page !== "calendar");
  schedulePage.classList.toggle("hidden", page !== "schedule");
  adminPage.classList.toggle("hidden", page !== "admin");

  navButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.page === page);
  });

  dayPanel.classList.remove("open");

  if (page === "admin") {
    await loadGoals();
  }
}

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

  for (let date = 1; date <= lastDate; date++) {
    createDayCell(new Date(year, month, date), false);
  }

  const totalCells = calendarGrid.children.length;
  const remainingCells = totalCells <= 35 ? 35 - totalCells : 42 - totalCells;

  for (let date = 1; date <= remainingCells; date++) {
    createDayCell(new Date(year, month + 1, date), true);
  }

  loadMonthlyGoalSummary(year, month);
}

function createDayCell(date, otherMonth) {
  const day = document.createElement("div");
  day.classList.add("calendar-day");
  if (otherMonth) day.classList.add("other-month");

  const weekday = date.getDay();
  if (weekday === 0) day.classList.add("sunday");
  if (weekday === 6) day.classList.add("saturday");

  const today = new Date();
  const isToday =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();

  if (isToday) day.classList.add("today");

  const dayNumber = document.createElement("div");
  dayNumber.className = "day-number";
  dayNumber.textContent = date.getDate();
  day.appendChild(dayNumber);

  day.addEventListener("click", () => openDayPanel(date));
  calendarGrid.appendChild(day);
}

async function openDayPanel(date) {
  const weekdayNames = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];
  const clickedDateKey = formatDateKey(date);

  if (
    dayPanel.classList.contains("open") &&
    selectedRecordDate === clickedDateKey
  ) {
    closeDayPanel();
    return;
  }

  selectedRecordDate = clickedDateKey;

  selectedDateTitle.textContent =
    `${date.getFullYear()}. ${date.getMonth() + 1}. ${date.getDate()}. ${weekdayNames[date.getDay()]}`;

  dayPanel.classList.add("open");
  await loadDailyGoalRecords(selectedRecordDate);
}

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function closeDayPanel() {
  dayPanel.classList.remove("open");
}

prevMonthButton.addEventListener("click", () => {
  currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
  renderCalendar();
});

nextMonthButton.addEventListener("click", () => {
  currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
  renderCalendar();
});

closeDayPanelButton.addEventListener("click", closeDayPanel);

/* =========================
   MONTHLY GOAL SUMMARY
========================= */

async function loadMonthlyGoalSummary(year, monthIndex) {
  goalSummaryList.innerHTML = '<p class="empty-text">통계를 불러오는 중이에요.</p>';

  const monthStart = `${year}-${String(monthIndex + 1).padStart(2, "0")}-01`;
  const nextMonthDate = new Date(year, monthIndex + 1, 1);
  const nextMonthStart =
    `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, "0")}-01`;

  const goalsResult = await supabaseClient
    .from("goals")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (goalsResult.error) {
    console.error("월간 통계 목표 불러오기 오류:", goalsResult.error);
    goalSummaryList.innerHTML = '<p class="error-text">목표 통계를 불러오지 못했어요.</p>';
    return;
  }

  const activeGoals = goalsResult.data || [];

  if (!activeGoals.length) {
    goalSummaryList.innerHTML =
      '<p class="empty-text">등록된 목표가 없어요. 어드민에서 목표를 추가하면 월간 통계가 여기에 표시돼요.</p>';
    return;
  }

  const recordsResult = await supabaseClient
    .from("daily_goal_records")
    .select("goal_id,status,record_date")
    .gte("record_date", monthStart)
    .lt("record_date", nextMonthStart);

  if (recordsResult.error) {
    console.error("월간 목표 기록 불러오기 오류:", recordsResult.error);
    goalSummaryList.innerHTML = '<p class="error-text">목표 통계를 불러오지 못했어요.</p>';
    return;
  }

  renderMonthlyGoalSummary(activeGoals, recordsResult.data || []);
}

function renderMonthlyGoalSummary(activeGoals, records) {
  goalSummaryList.innerHTML = "";

  const labels = {
    success: "성공",
    effort: "노력",
    holiday: "휴일",
    fail: "실패"
  };

  activeGoals.forEach((goal) => {
    const goalRecords = records.filter((record) => record.goal_id === goal.id);

    const counts = {
      success: 0,
      effort: 0,
      holiday: 0,
      fail: 0
    };

    goalRecords.forEach((record) => {
      if (Object.prototype.hasOwnProperty.call(counts, record.status)) {
        counts[record.status] += 1;
      }
    });

    const total = Object.values(counts).reduce((sum, value) => sum + value, 0);

    const card = document.createElement("div");
    card.className = "goal-summary-item";

    const heading = document.createElement("div");
    heading.className = "goal-summary-item-heading";

    const name = document.createElement("strong");
    name.textContent = goal.name;

    const totalText = document.createElement("span");
    totalText.textContent = total ? `${total}일 기록` : "아직 기록 없음";

    heading.append(name, totalText);

    const bar = document.createElement("div");
    bar.className = "goal-stat-bar";

    ["success", "effort", "holiday", "fail"].forEach((status) => {
      const segment = document.createElement("div");
      segment.className = `goal-stat-segment stat-${status}`;

      const percent = total ? (counts[status] / total) * 100 : 0;
      segment.style.width = `${percent}%`;

      if (percent > 0) {
        segment.title = `${labels[status]} ${counts[status]}일 (${Math.round(percent)}%)`;
      }

      bar.appendChild(segment);
    });

    if (!total) {
      bar.classList.add("empty");
    }

    const legend = document.createElement("div");
    legend.className = "goal-stat-legend";

    ["success", "effort", "holiday", "fail"].forEach((status) => {
      const item = document.createElement("span");
      item.className = "goal-stat-legend-item";

      const dot = document.createElement("i");
      dot.className = `legend-dot stat-${status}`;

      const percent = total ? Math.round((counts[status] / total) * 100) : 0;
      item.append(dot, document.createTextNode(`${labels[status]} ${percent}%`));
      legend.appendChild(item);
    });

    card.append(heading, bar, legend);
    goalSummaryList.appendChild(card);
  });
}

/* =========================
   DAILY GOAL RECORDS
========================= */

async function loadDailyGoalRecords(recordDate) {
  dailyGoalRecordList.innerHTML = '<p class="empty-text">목표를 불러오는 중이에요.</p>';
  goalRecordSaveState.textContent = "";

  const goalsResult = await supabaseClient
    .from("goals")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (goalsResult.error) {
    console.error("목표 불러오기 오류:", goalsResult.error);
    dailyGoalRecordList.innerHTML = '<p class="error-text">목표를 불러오지 못했어요.</p>';
    return;
  }

  const activeGoals = goalsResult.data || [];

  if (!activeGoals.length) {
    dailyGoalRecordList.innerHTML = '<p class="empty-text">등록된 목표가 없어요. 어드민에서 먼저 목표를 추가해주세요.</p>';
    return;
  }

  const recordsResult = await supabaseClient
    .from("daily_goal_records")
    .select("*")
    .eq("record_date", recordDate);

  if (recordsResult.error) {
    console.error("목표 기록 불러오기 오류:", recordsResult.error);
    dailyGoalRecordList.innerHTML = '<p class="error-text">이 날짜의 기록을 불러오지 못했어요.</p>';
    return;
  }

  const recordMap = new Map(
    (recordsResult.data || []).map((record) => [record.goal_id, record])
  );

  renderDailyGoalRecords(activeGoals, recordMap);
}

function renderDailyGoalRecords(activeGoals, recordMap) {
  dailyGoalRecordList.innerHTML = "";

  activeGoals.forEach((goal) => {
    const row = document.createElement("div");
    row.className = "daily-goal-row";

    const goalInfo = document.createElement("div");
    goalInfo.className = "daily-goal-info";

    const name = document.createElement("strong");
    name.textContent = goal.name;
    goalInfo.appendChild(name);

    if (goal.description) {
      const description = document.createElement("span");
      description.textContent = goal.description;
      goalInfo.appendChild(description);
    }

    const select = document.createElement("select");
    select.className = "goal-status-select";
    select.dataset.goalId = goal.id;

    [
      ["", "미기록"],
      ["success", "성공"],
      ["effort", "노력은 함"],
      ["holiday", "휴일"],
      ["fail", "실패"]
    ].forEach(([value, label]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      select.appendChild(option);
    });

    select.value = recordMap.get(goal.id)?.status || "";
    applyGoalStatusClass(select);

    select.addEventListener("change", async () => {
      applyGoalStatusClass(select);
      await saveDailyGoalRecord(goal.id, select.value, select);
    });

    row.append(goalInfo, select);
    dailyGoalRecordList.appendChild(row);
  });
}

function applyGoalStatusClass(select) {
  select.classList.remove("status-success", "status-effort", "status-holiday", "status-fail");
  if (select.value) select.classList.add(`status-${select.value}`);
}

async function saveDailyGoalRecord(goalId, status, select) {
  if (!selectedRecordDate) return;

  select.disabled = true;
  goalRecordSaveState.textContent = "저장 중...";

  let error = null;

  if (!status) {
    const result = await supabaseClient
      .from("daily_goal_records")
      .delete()
      .eq("record_date", selectedRecordDate)
      .eq("goal_id", goalId);
    error = result.error;
  } else {
    const result = await supabaseClient
      .from("daily_goal_records")
      .upsert(
        {
          record_date: selectedRecordDate,
          goal_id: goalId,
          status
        },
        { onConflict: "record_date,goal_id" }
      );
    error = result.error;
  }

  select.disabled = false;

  if (error) {
    console.error("목표 기록 저장 오류:", error);
    goalRecordSaveState.textContent = "저장 실패";
    return;
  }

  goalRecordSaveState.textContent = "저장됨";

  const recordDateObject = new Date(`${selectedRecordDate}T00:00:00`);
  if (
    recordDateObject.getFullYear() === currentDate.getFullYear() &&
    recordDateObject.getMonth() === currentDate.getMonth()
  ) {
    loadMonthlyGoalSummary(currentDate.getFullYear(), currentDate.getMonth());
  }

  window.clearTimeout(saveDailyGoalRecord._timer);
  saveDailyGoalRecord._timer = window.setTimeout(() => {
    goalRecordSaveState.textContent = "";
  }, 1200);
}

/* =========================
   ADMIN: GOALS
========================= */

async function loadGoals() {
  goalList.innerHTML = '<p class="empty-text">목표를 불러오는 중이에요.</p>';
  goalMessage.textContent = "";

  const { data, error } = await supabaseClient
    .from("goals")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    console.error("목표 불러오기 오류:", error);
    goalList.innerHTML = '<p class="error-text">목표를 불러오지 못했어요.</p>';
    return;
  }

  goals = data || [];
  renderGoalList();
}

function renderGoalList() {
  if (!goals.length) {
    goalList.innerHTML = '<p class="empty-text">아직 등록된 목표가 없어요. 위에서 첫 목표를 추가해보세요.</p>';
    return;
  }

  goalList.innerHTML = "";

  goals.forEach((goal) => {
    const item = document.createElement("div");
    item.className = "goal-item";
    item.draggable = true;
    item.dataset.goalId = goal.id;

    const dragHandle = document.createElement("div");
    dragHandle.className = "goal-drag-handle";
    dragHandle.textContent = "⋮⋮";
    dragHandle.title = "드래그해서 순서 변경";

    const text = document.createElement("div");
    text.className = "goal-item-text";

    const name = document.createElement("strong");
    name.textContent = goal.name;
    text.appendChild(name);

    if (goal.description) {
      const description = document.createElement("span");
      description.textContent = goal.description;
      text.appendChild(description);
    }

    const actions = document.createElement("div");
    actions.className = "goal-actions";

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "secondary-button";
    editButton.textContent = "수정";
    editButton.addEventListener("click", (event) => {
      event.stopPropagation();
      startGoalEdit(goal);
    });

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "danger-button";
    deleteButton.textContent = "삭제";
    deleteButton.addEventListener("click", (event) => {
      event.stopPropagation();
      deleteGoal(goal);
    });

    actions.append(editButton, deleteButton);
    item.append(dragHandle, text, actions);

    item.addEventListener("dragstart", handleGoalDragStart);
    item.addEventListener("dragover", handleGoalDragOver);
    item.addEventListener("drop", handleGoalDrop);
    item.addEventListener("dragend", handleGoalDragEnd);

    goalList.appendChild(item);
  });
}

let draggedGoalId = null;

function handleGoalDragStart(event) {
  draggedGoalId = Number(event.currentTarget.dataset.goalId);
  event.currentTarget.classList.add("dragging");

  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(draggedGoalId));
  }
}

function handleGoalDragOver(event) {
  event.preventDefault();

  const target = event.currentTarget;

  if (!draggedGoalId || Number(target.dataset.goalId) === draggedGoalId) {
    return;
  }

  const rect = target.getBoundingClientRect();
  const insertAfter = event.clientY > rect.top + rect.height / 2;

  const draggedElement = goalList.querySelector(`[data-goal-id="${draggedGoalId}"]`);

  if (!draggedElement) return;

  if (insertAfter) {
    target.after(draggedElement);
  } else {
    target.before(draggedElement);
  }
}

async function handleGoalDrop(event) {
  event.preventDefault();
  await saveGoalOrderFromDom();
}

function handleGoalDragEnd() {
  goalList.querySelectorAll(".goal-item").forEach((item) => {
    item.classList.remove("dragging");
  });

  draggedGoalId = null;
}

async function saveGoalOrderFromDom() {
  const orderedIds = [...goalList.querySelectorAll(".goal-item")]
    .map((item) => Number(item.dataset.goalId));

  if (!orderedIds.length) return;

  const previousGoals = [...goals];

  goals = orderedIds
    .map((id, index) => {
      const goal = previousGoals.find((item) => item.id === id);
      return goal ? { ...goal, sort_order: index } : null;
    })
    .filter(Boolean);

  goalMessage.textContent = "순서 저장 중...";

  const updates = goals.map((goal) =>
    supabaseClient
      .from("goals")
      .update({ sort_order: goal.sort_order })
      .eq("id", goal.id)
  );

  const results = await Promise.all(updates);
  const failed = results.find((result) => result.error);

  if (failed) {
    console.error("목표 순서 저장 오류:", failed.error);
    goalMessage.textContent = "순서를 저장하지 못했어요.";
    goals = previousGoals;
    renderGoalList();
    return;
  }

  goalMessage.textContent = "순서를 저장했어요.";
}

goalForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const name = goalNameInput.value.trim();
  const description = goalDescriptionInput.value.trim();

  if (!name) return;

  goalSubmitButton.disabled = true;
  goalMessage.textContent = editingGoalId ? "수정 중..." : "추가 중...";

  let error;

  if (editingGoalId) {
    ({ error } = await supabaseClient
      .from("goals")
      .update({
        name,
        description: description || null
      })
      .eq("id", editingGoalId));
  } else {
    const nextSortOrder = goals.length
      ? Math.max(...goals.map((goal) => Number(goal.sort_order) || 0)) + 1
      : 0;

    ({ error } = await supabaseClient
      .from("goals")
      .insert({
        name,
        description: description || null,
        sort_order: nextSortOrder,
        is_active: true
      }));
  }

  goalSubmitButton.disabled = false;

  if (error) {
    console.error("목표 저장 오류:", error);
    goalMessage.textContent = "저장하지 못했어요. 다시 시도해주세요.";
    return;
  }

  resetGoalForm();
  goalMessage.textContent = "저장했어요.";
  await loadGoals();
});

function startGoalEdit(goal) {
  editingGoalId = goal.id;
  goalNameInput.value = goal.name;
  goalDescriptionInput.value = goal.description || "";
  goalSubmitButton.textContent = "수정 저장";
  goalNameInput.focus();
  goalMessage.textContent = "수정할 내용을 바꾼 뒤 저장해주세요.";
}

function resetGoalForm() {
  editingGoalId = null;
  goalForm.reset();
  goalSubmitButton.textContent = "목표 추가";
}

async function deleteGoal(goal) {
  const confirmed = window.confirm(`"${goal.name}" 목표를 삭제할까요?\n이 목표의 날짜별 달성 기록도 함께 삭제됩니다.`);
  if (!confirmed) return;

  const { error } = await supabaseClient
    .from("goals")
    .delete()
    .eq("id", goal.id);

  if (error) {
    console.error("목표 삭제 오류:", error);
    goalMessage.textContent = "삭제하지 못했어요.";
    return;
  }

  if (editingGoalId === goal.id) resetGoalForm();
  goalMessage.textContent = "삭제했어요.";
  await loadGoals();
}

checkSession();
