-- Memos are placed in cells of a grid (row, column). Any cell may stay empty, so a row does not have
-- to be full before the next one is used. Existing memos have no cell yet; the board shows them in
-- their current order (and rows) and stores cells the first time the layout is changed.
ALTER TABLE memo_items ADD COLUMN grid_row INTEGER;
ALTER TABLE memo_items ADD COLUMN grid_col INTEGER;
