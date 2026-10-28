CREATE TABLE IF NOT EXISTS memo_items (
 id TEXT PRIMARY KEY,
 kind TEXT NOT NULL CHECK(kind IN ('note','folder')),
 title TEXT NOT NULL DEFAULT '',
 content TEXT NOT NULL DEFAULT '',
 folder_id TEXT REFERENCES memo_items(id) ON DELETE SET NULL,
 x REAL NOT NULL DEFAULT 24,
 y REAL NOT NULL DEFAULT 24,
 updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS memo_folder ON memo_items(folder_id);
CREATE TABLE IF NOT EXISTS memo_images (
 id TEXT PRIMARY KEY,
 mime TEXT NOT NULL,
 bytes BLOB NOT NULL
);
