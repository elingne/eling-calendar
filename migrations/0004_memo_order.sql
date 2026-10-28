-- Memos are now shown in a simple ordered list instead of freely positioned cards.
-- sort_order keeps the order inside the board (or inside one folder). Existing memos keep the
-- order they were visually in (top to bottom, then left to right). x/y are kept untouched.
ALTER TABLE memo_items ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
UPDATE memo_items SET sort_order = (
  SELECT r.n FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY COALESCE(folder_id,'') ORDER BY y, x, id) AS n FROM memo_items
  ) r WHERE r.id = memo_items.id
);
