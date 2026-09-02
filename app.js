let currentDate = new Date();
let currentSession = null;
let goals = [];
let editingGoalId = null;

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
const prevMonthButton = document.getElementById("prevMonth");
const nextMonthButton = document.getElementById("nextMonth");
const dayPanel = document.getElementById("dayPanel");
const closeDayPanelButton = document.getElementById("closeDayPanel");
const selectedDateTitle = document.getElementById("selectedDateTitle");

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

function openDayPanel(date) {
  const weekdayNames = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];
  selectedDateTitle.textContent =
    `${date.getFullYear()}. ${date.getMonth() + 1}. ${date.getDate()}. ${weekdayNames[date.getDay()]}`;
  dayPanel.classList.add("open");
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
