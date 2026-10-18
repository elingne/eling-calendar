-- Run each SELECT individually in the old database SQL Editor and export ALL rows as CSV.
-- Save each result using the matching table name. These queries do not change data.
SELECT * FROM public.events ORDER BY id;
SELECT * FROM public.quick_todos ORDER BY id;
SELECT * FROM public.todos ORDER BY id;
SELECT * FROM public.schedule_notes ORDER BY id;
SELECT * FROM public.moods ORDER BY id;
SELECT * FROM public.period_records ORDER BY id;
