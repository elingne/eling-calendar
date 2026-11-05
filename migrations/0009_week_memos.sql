-- 금주의 메모: 주(월요일 날짜)마다 메모지 한 장. 새 테이블만 추가하며 기존 일정과 기록은 건드리지 않습니다.
CREATE TABLE IF NOT EXISTS week_memos (
 week_start TEXT PRIMARY KEY,
 body TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
