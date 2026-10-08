-- Reset every auto-increment (id) sequence to MAX(id) after importing data with explicit IDs.
-- REQUIRED once after import-data.ts on PostgreSQL: rows were inserted with their original
-- ids, but the id sequences still start at 1, so the next insert would collide on the PK.
-- Safe to re-run. Skips tables without an integer `id` sequence (e.g. Setting, ExamClass).
DO $$
DECLARE
  r RECORD;
  seq TEXT;
BEGIN
  FOR r IN
    SELECT table_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'id'
  LOOP
    seq := pg_get_serial_sequence(quote_ident(r.table_name), 'id');
    IF seq IS NOT NULL THEN
      EXECUTE format(
        'SELECT setval(%L, COALESCE((SELECT MAX(id) FROM %I), 1))',
        seq, r.table_name
      );
    END IF;
  END LOOP;
END $$;
