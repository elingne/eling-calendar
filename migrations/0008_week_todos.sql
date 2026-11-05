-- 금주의 할 일: 주(월요일 날짜)별로 따로 저장합니다. 새 테이블만 추가하며 기존 일정과 기록은 건드리지 않습니다.
CREATE TABLE IF NOT EXISTS week_todos (
 id TEXT PRIMARY KEY,
 week_start TEXT NOT NULL,
 title TEXT NOT NULL,
 is_done INTEGER NOT NULL DEFAULT 0,
 sort_order REAL NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS week_todos_week ON week_todos(week_start);
