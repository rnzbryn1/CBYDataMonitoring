-- =====================================================
-- UNIFIED TEMPLATE FORMULAS TABLE CREATION
-- =====================================================

-- Create the new unified template_formulas table
CREATE TABLE IF NOT EXISTS public.template_formulas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL,
  column_id uuid NOT NULL,
  entry_id uuid, -- NULL for column/computation formulas
  formula_type text NOT NULL CHECK (formula_type IN ('cell', 'column', 'computation')),
  formula text NOT NULL,
  function_type text CHECK (function_type IN ('sum', 'average', 'max', 'min', 'count')),
  display_position text DEFAULT 'bottom' CHECK (display_position IN ('top', 'bottom')),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT template_formulas_pkey PRIMARY KEY (id),
  CONSTRAINT template_formulas_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.encoding_templates(id),
  CONSTRAINT template_formulas_column_id_fkey FOREIGN KEY (column_id) REFERENCES public.encoding_columns(id),
  CONSTRAINT template_formulas_entry_id_fkey FOREIGN KEY (entry_id) REFERENCES public.encoding_entries(id)
);

-- Create unique constraint for proper ON CONFLICT handling
-- This handles both cell formulas (with entry_id) and column/computation formulas (entry_id IS NULL)
ALTER TABLE public.template_formulas 
ADD CONSTRAINT template_formulas_unique 
UNIQUE (template_id, column_id, entry_id);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_template_formulas_template_id ON public.template_formulas(template_id);
CREATE INDEX IF NOT EXISTS idx_template_formulas_column_id ON public.template_formulas(column_id);
CREATE INDEX IF NOT EXISTS idx_template_formulas_entry_id ON public.template_formulas(entry_id);
CREATE INDEX IF NOT EXISTS idx_template_formulas_type ON public.template_formulas(formula_type);

-- =====================================================
-- DATA MIGRATION FROM OLD TABLES
-- =====================================================

-- Migrate cell_formulas to template_formulas
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
FROM public.cell_formulas
ON CONFLICT (template_id, column_id, entry_id) DO NOTHING;

-- Migrate column_computation to template_formulas
INSERT INTO public.template_formulas (id, template_id, column_id, entry_id, formula_type, function_type, display_position, created_at, updated_at)
SELECT 
  gen_random_uuid() as id,
  template_id,
  column_id,
  NULL as entry_id,  -- Column computations have no entry_id
  'computation' as formula_type,
  function_type,
  display_position,
  created_at,
  updated_at
FROM public.column_computation
ON CONFLICT (template_id, column_id, entry_id) DO NOTHING;

-- =====================================================
-- DROP OLD TABLES (AFTER MIGRATION VERIFICATION)
-- =====================================================

-- Uncomment these lines after verifying successful migration
-- DROP TABLE IF EXISTS public.cell_formulas CASCADE;
-- DROP TABLE IF EXISTS public.column_computation CASCADE;
-- DROP TABLE IF EXISTS public.computation_operations CASCADE;

-- =====================================================
-- REMOVE UNUSED COLUMNS
-- =====================================================

-- Remove cell_color from encoding_entry_values
ALTER TABLE public.encoding_entry_values DROP COLUMN IF EXISTS cell_color;

-- Remove is_computed from encoding_columns
ALTER TABLE public.encoding_columns DROP COLUMN IF EXISTS is_computed;

-- Remove verified_by and verified_at from encoding_entries
ALTER TABLE public.encoding_entries DROP COLUMN IF EXISTS verified_by;
ALTER TABLE public.encoding_entries DROP COLUMN IF EXISTS verified_at;

-- Add created_at to encoding_template_columns if it doesn't exist
ALTER TABLE public.encoding_template_columns ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();

-- =====================================================
-- UPDATE TEMPLATE MODULE CONSTRAINTS
-- =====================================================

-- Add proper check constraint for module field
ALTER TABLE public.encoding_templates 
ADD CONSTRAINT encoding_templates_module_check 
CHECK (module IN ('encoding', 'monitoring'));

-- Update any existing 'General' values to 'encoding'
UPDATE public.encoding_templates 
SET module = 'encoding' 
WHERE module = 'General';

-- =====================================================
-- CLEANUP UNUSED MONITORING TABLES
-- =====================================================

-- These tables were identified as unused and can be safely removed
-- Uncomment after verifying no active usage
-- DROP TABLE IF EXISTS public.monitoring_aggregations CASCADE;
-- DROP TABLE IF EXISTS public.monitoring_computed_metrics CASCADE;
-- DROP TABLE IF EXISTS public.monitoring_definitions CASCADE;
