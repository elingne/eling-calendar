let currentDate = new Date();

const calendarTitle = document.getElementById("calendarTitle");
const calendarGrid = document.getElementById("calendarGrid");

const prevMonthButton = document.getElementById("prevMonth");
const nextMonthButton = document.getElementById("nextMonth");

const dayPanel = document.getElementById("dayPanel");
const closeDayPanelButton = document.getElementById("closeDayPanel");
const selectedDateTitle = document.getElementById("selectedDateTitle");


function renderCalendar() {

  calendarGrid.innerHTML = "";

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  calendarTitle.textContent =
    `${year}년 ${month + 1}월`;


  const firstDay =
    new Date(year, month, 1).getDay();

  const lastDate =
    new Date(year, month + 1, 0).getDate();

  const previousMonthLastDate =
    new Date(year, month, 0).getDate();


  /*
   * 앞달 날짜
   */

  for (let i = firstDay - 1; i >= 0; i--) {

    const date =
      previousMonthLastDate - i;

    const cellDate =
      new Date(year, month - 1, date);

    createDayCell(
      cellDate,
      true
    );
  }


  /*
   * 이번 달
   */

  for (let date = 1; date <= lastDate; date++) {

    const cellDate =
      new Date(year, month, date);

    createDayCell(
      cellDate,
      false
    );
  }


  /*
   * 뒷달 날짜
   */

  const totalCells =
    calendarGrid.children.length;

  const remainingCells =
    totalCells <= 35
      ? 35 - totalCells
      : 42 - totalCells;


  for (let date = 1; date <= remainingCells; date++) {

    const cellDate =
      new Date(year, month + 1, date);

    createDayCell(
      cellDate,
      true
    );
  }
}


function createDayCell(date, otherMonth) {

  const day = document.createElement("div");

  day.classList.add("calendar-day");


  if (otherMonth) {
    day.classList.add("other-month");
  }


  const weekday =
    date.getDay();


  if (weekday === 0) {
    day.classList.add("sunday");
  }

  if (weekday === 6) {
    day.classList.add("saturday");
  }


  /*
   * 오늘 표시
   */

  const today = new Date();

  const isToday =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();


  if (isToday) {
    day.classList.add("today");
  }


  const dayNumber =
    document.createElement("div");

  dayNumber.className =
    "day-number";

  dayNumber.textContent =
    date.getDate();


  day.appendChild(dayNumber);


  /*
   * 날짜 클릭
   */

  day.addEventListener("click", () => {
    openDayPanel(date);
  });


  calendarGrid.appendChild(day);
}


function openDayPanel(date) {

  const year =
    date.getFullYear();

  const month =
    date.getMonth() + 1;

  const day =
    date.getDate();


  const weekdayNames = [
    "일요일",
    "월요일",
    "화요일",
    "수요일",
    "목요일",
    "금요일",
    "토요일"
  ];


  selectedDateTitle.textContent =
    `${year}. ${month}. ${day}. ${weekdayNames[date.getDay()]}`;


  dayPanel.classList.add("open");
}


function closeDayPanel() {
  dayPanel.classList.remove("open");
}


/*
 * 이전 달
 */

prevMonthButton.addEventListener("click", () => {

  currentDate =
    new Date(
      currentDate.getFullYear(),
      currentDate.getMonth() - 1,
      1
    );

  renderCalendar();
});


/*
 * 다음 달
 */

nextMonthButton.addEventListener("click", () => {

  currentDate =
    new Date(
      currentDate.getFullYear(),
      currentDate.getMonth() + 1,
      1
    );

  renderCalendar();
});


closeDayPanelButton.addEventListener(
  "click",
  closeDayPanel
);


/*
 * 최초 실행
 */

renderCalendar();
