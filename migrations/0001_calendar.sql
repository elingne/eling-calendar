CREATE TABLE IF NOT EXISTS records (
  collection TEXT NOT NULL CHECK(collection IN ('events','quick_todos','todos','schedule_notes','moods','period_records')),
  id INTEGER NOT NULL,
  data TEXT NOT NULL CHECK(json_valid(data)),
  PRIMARY KEY(collection,id)
);
CREATE INDEX IF NOT EXISTS events_start ON records(json_extract(data,'$.start_date')) WHERE collection='events';
CREATE UNIQUE INDEX IF NOT EXISTS moods_date ON records(json_extract(data,'$.record_date')) WHERE collection='moods';
