-- Upload time lets the Worker remove photos that never ended up in a memo,
-- while leaving recently uploaded photos (an editor may still be open) alone.
-- Existing rows get "now" so they also receive the normal 24 hour grace period.
ALTER TABLE memo_images ADD COLUMN created_at TEXT;
UPDATE memo_images SET created_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE created_at IS NULL;
