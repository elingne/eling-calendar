-- 실시간 동기화: 일정·할 일·메모가 바뀔 때마다 1씩 올라가는 변경 번호 한 줄. 새 테이블만 추가하며 기존 일정과 기록은 건드리지 않습니다.
CREATE TABLE IF NOT EXISTS sync_state (
 id INTEGER PRIMARY KEY CHECK (id = 1),
 version INTEGER NOT NULL,
 updated_at TEXT NOT NULL
);
INSERT OR IGNORE INTO sync_state (id, version, updated_at) VALUES (1, 0, '');
