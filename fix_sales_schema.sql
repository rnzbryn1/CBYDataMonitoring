-- =====================================================
-- FIX SCHEMA GAPS FOR SALES DESK + GENERAL STABILITY
-- Run this in Supabase SQL Editor
-- =====================================================

-- 0) Ensure existing data is assigned to PCD (id=1)
-- First, show what needs fixing (review before running updates below)
SELECT 'encoding_templates' as table_name, COUNT(*) as rows_to_fix
FROM public.encoding_templates WHERE department_id IS NULL OR department_id = 0
UNION ALL
SELECT 'encoding_entries', COUNT(*) 
FROM public.encoding_entries WHERE department_id IS NULL OR department_id = 0
UNION ALL
SELECT 'encoding_columns', COUNT(*) 
FROM public.encoding_columns WHERE department_id IS NULL OR department_id = 0;

-- Uncomment these ONLY if the count above shows orphaned rows:
-- UPDATE public.encoding_templates SET department_id = 1 WHERE department_id IS NULL OR department_id = 0;
-- UPDATE public.encoding_entries     SET department_id = 1 WHERE department_id IS NULL OR department_id = 0;
-- UPDATE public.encoding_columns     SET department_id = 1 WHERE department_id IS NULL OR department_id = 0;

-- 1) Fix template_formulas missing default UUID
ALTER TABLE public.template_formulas
    ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- 2) Clean up orphaned rows in template_formulas (entry_id referencing deleted encoding_entries)
DELETE FROM public.template_formulas tf
WHERE tf.entry_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.encoding_entries ee WHERE ee.id = tf.entry_id);

-- 3) Add FKs to template_formulas (matches your schema_migration.sql)
ALTER TABLE public.template_formulas
    DROP CONSTRAINT IF EXISTS template_formulas_template_id_fkey,
    ADD CONSTRAINT template_formulas_template_id_fkey
        FOREIGN KEY (template_id) REFERENCES public.encoding_templates(id);

ALTER TABLE public.template_formulas
    DROP CONSTRAINT IF EXISTS template_formulas_column_id_fkey,
    ADD CONSTRAINT template_formulas_column_id_fkey
        FOREIGN KEY (column_id) REFERENCES public.encoding_columns(id);

ALTER TABLE public.template_formulas
    DROP CONSTRAINT IF EXISTS template_formulas_entry_id_fkey,
    ADD CONSTRAINT template_formulas_entry_id_fkey
        FOREIGN KEY (entry_id) REFERENCES public.encoding_entries(id);

-- 4) Prevent duplicate cell values (same entry + same column)
ALTER TABLE public.encoding_entry_values
    DROP CONSTRAINT IF EXISTS encoding_entry_values_entry_column_unique;

ALTER TABLE public.encoding_entry_values
    ADD CONSTRAINT encoding_entry_values_entry_column_unique
    UNIQUE (entry_id, column_id);

-- 5) Allow duplicate column names in different groups (from your update_column_constraint.sql)
ALTER TABLE public.encoding_columns
    DROP CONSTRAINT IF EXISTS encoding_columns_column_name_key,
    DROP CONSTRAINT IF EXISTS encoding_columns_department_id_column_name_key,
    DROP CONSTRAINT IF EXISTS encoding_columns_dept_col_group_unique,
    DROP CONSTRAINT IF EXISTS encoding_columns_unique_per_dept;

ALTER TABLE public.encoding_columns
    ADD CONSTRAINT encoding_columns_dept_col_group_unique
    UNIQUE (department_id, column_name, group_name);

-- Verify
SELECT tablename, indexname FROM pg_indexes WHERE schemaname = 'public' ORDER BY tablename;
