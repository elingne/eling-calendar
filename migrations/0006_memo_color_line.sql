-- Memo paper colour ('' = white, or a pastel: red/orange/yellow/green/blue) and a flag that makes a
-- memo start a new row on the board. Existing memos stay white and keep their current layout.
ALTER TABLE memo_items ADD COLUMN color TEXT NOT NULL DEFAULT '';
ALTER TABLE memo_items ADD COLUMN line_break INTEGER NOT NULL DEFAULT 0;
