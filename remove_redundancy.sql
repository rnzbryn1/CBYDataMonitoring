-- =====================================================
-- REMOVE SCHEMA REDUNDANCY
-- Run this in Supabase SQL Editor AFTER schema_migration.sql
-- =====================================================

-- =====================================================
-- 1. MIGRATE any remaining cell_formulas data (safety net)
-- =====================================================
INSERT INTO public.template_formulas (id, template_id, entry_id, column_id, formula_type, formula, created_at, updated_at)
SELECT 
  gen_random_uuid() as id,
  template_id,
  entry_id,
  column_id,
  formula_type,
  formula,
  created_at,
  updated_at
FROM public.cell_formulas cf
WHERE EXISTS (
  SELECT 1 FROM public.encoding_entries ee 
  WHERE ee.id = cf.entry_id
)
ON CONFLICT (template_id, column_id, entry_id) DO NOTHING;

-- =====================================================
-- 2. DROP redundant tables replaced by template_formulas
-- =====================================================
DROP TABLE IF EXISTS public.cell_formulas CASCADE;
DROP TABLE IF EXISTS public.computation_operations CASCADE;

-- Note: column_computation should already be dropped per schema_migration.sql.
-- If it somehow still exists, drop it too:
DROP TABLE IF EXISTS public.column_computation CASCADE;

-- Note: monitoring_* tables should already be dropped per schema_migration.sql.
-- If they somehow still exist, drop them too:
DROP TABLE IF EXISTS public.monitoring_aggregations CASCADE;
DROP TABLE IF EXISTS public.monitoring_computed_metrics CASCADE;
DROP TABLE IF EXISTS public.monitoring_definitions CASCADE;

-- =====================================================
-- 3. DROP redundant columns (already removed in your schema,
--    but safe to re-run with IF EXISTS)
-- =====================================================
ALTER TABLE public.encoding_entry_values
  DROP COLUMN IF EXISTS cell_color;

ALTER TABLE public.encoding_columns
  DROP COLUMN IF EXISTS is_computed;

ALTER TABLE public.encoding_entries
  DROP COLUMN IF EXISTS verified_by,
  DROP COLUMN IF EXISTS verified_at;

-- =====================================================
-- 4. FIX template_formulas gaps (if not already fixed)
-- =====================================================
-- Ensure DEFAULT UUID on id
ALTER TABLE public.template_formulas
    ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- Add missing FKs (safe to re-run with DROP IF EXISTS first)
ALTER TABLE public.template_formulas
    DROP CONSTRAINT IF EXISTS template_formulas_template_id_fkey,
    ADD CONSTRAINT template_formulas_template_id_fkey
        FOREIGN KEY (template_id) REFERENCES public.encoding_templates(id) ON DELETE CASCADE;

ALTER TABLE public.template_formulas
    DROP CONSTRAINT IF EXISTS template_formulas_column_id_fkey,
    ADD CONSTRAINT template_formulas_column_id_fkey
        FOREIGN KEY (column_id) REFERENCES public.encoding_columns(id) ON DELETE CASCADE;

ALTER TABLE public.template_formulas
    DROP CONSTRAINT IF EXISTS template_formulas_entry_id_fkey,
    ADD CONSTRAINT template_formulas_entry_id_fkey
        FOREIGN KEY (entry_id) REFERENCES public.encoding_entries(id) ON DELETE CASCADE;

-- Add unique constraint for upserts
ALTER TABLE public.template_formulas
    DROP CONSTRAINT IF EXISTS template_formulas_unique,
    ADD CONSTRAINT template_formulas_unique
    UNIQUE (template_id, column_id, entry_id);

-- =====================================================
-- 5. CLEANUP leftover constraints referencing dropped tables
-- =====================================================
-- computation_operations was referenced by monitoring_computed_metrics
-- Since both are dropped, any dangling FK constraints are gone with CASCADE.
-- If monitoring_computed_metrics still exists and has a dangling FK:
ALTER TABLE IF EXISTS public.monitoring_computed_metrics
    DROP CONSTRAINT IF EXISTS monitoring_computed_metrics_operation_fkey;

-- =====================================================
-- 6. VERIFY: list all remaining public tables
-- =====================================================
SELECT 
    table_name,
    (SELECT COUNT(*) FROM information_schema.columns c 
     WHERE c.table_schema = t.table_schema AND c.table_name = t.table_name) as column_count
FROM information_schema.tables t
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
ORDER BY table_name;
