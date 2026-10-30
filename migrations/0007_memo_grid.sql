-- Memos are arranged in independent rows: grid_row is the row number, grid_col the position inside
-- that row (memos in a row are packed from the left). A row need not be full before the next one is
-- used. Existing memos have no row yet; the board keeps their current rows until the layout changes.
ALTER TABLE memo_items ADD COLUMN grid_row INTEGER;
ALTER TABLE memo_items ADD COLUMN grid_col INTEGER;
