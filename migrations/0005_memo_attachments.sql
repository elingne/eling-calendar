-- Photos are no longer placed inside the memo text; each memo keeps a list of attached photo ids
-- (JSON array) shown together in the memo's full view. Existing memos are untouched: photos that are
-- still inside old memo text keep working and move into this list the next time the memo is saved.
ALTER TABLE memo_items ADD COLUMN images TEXT NOT NULL DEFAULT '[]';
