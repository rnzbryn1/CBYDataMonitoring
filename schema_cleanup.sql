-- =====================================================
-- SCHEMA CLEANUP SCRIPT
-- Run this in Supabase SQL Editor
-- =====================================================

-- =====================================================
-- STEP 1: Remove redundant users table
-- =====================================================
-- Since Supabase provides auth.users, we don't need public.users
-- profiles table will handle additional user data

DROP TABLE IF EXISTS public.users CASCADE;

-- =====================================================
-- STEP 2: Remove redundant columns from encoding_entries
-- =====================================================
-- encoded_at duplicates created_at
-- encoded_by is redundant (use auth.uid() context)

ALTER TABLE encoding_entries 
  DROP COLUMN IF EXISTS encoded_at,
  DROP COLUMN IF EXISTS encoded_by;

-- =====================================================
-- STEP 3: Add unique constraint to encoding_entry_values
-- =====================================================
-- Prevents duplicate values for same entry/column combination

ALTER TABLE encoding_entry_values 
  DROP CONSTRAINT IF EXISTS encoding_entry_values_entry_column_unique;

ALTER TABLE encoding_entry_values 
  ADD CONSTRAINT encoding_entry_values_entry_column_unique 
  UNIQUE (entry_id, column_id);

-- =====================================================
-- STEP 4: Add CASCADE DELETE to foreign keys
-- =====================================================
-- This ensures data integrity when deleting templates/columns/entries

-- encoding_template_columns
ALTER TABLE encoding_template_columns 
  DROP CONSTRAINT IF EXISTS encoding_template_columns_template_fkey,
  ADD CONSTRAINT encoding_template_columns_template_fkey 
    FOREIGN KEY (template_id) REFERENCES encoding_templates(id) ON DELETE CASCADE;

ALTER TABLE encoding_template_columns 
  DROP CONSTRAINT IF EXISTS encoding_template_columns_column_fkey,
  ADD CONSTRAINT encoding_template_columns_column_fkey 
    FOREIGN KEY (column_id) REFERENCES encoding_columns(id) ON DELETE CASCADE;

-- encoding_entries
ALTER TABLE encoding_entries 
  DROP CONSTRAINT IF EXISTS encoding_entries_template_fkey,
  ADD CONSTRAINT encoding_entries_template_fkey 
    FOREIGN KEY (template_id) REFERENCES encoding_templates(id) ON DELETE CASCADE;

ALTER TABLE encoding_entries 
  DROP CONSTRAINT IF EXISTS encoding_entries_verified_by_fkey,
  ADD CONSTRAINT encoding_entries_verified_by_fkey 
    FOREIGN KEY (verified_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- encoding_entry_values
ALTER TABLE encoding_entry_values 
  DROP CONSTRAINT IF EXISTS encoding_entry_values_entry_fkey,
  ADD CONSTRAINT encoding_entry_values_entry_fkey 
    FOREIGN KEY (entry_id) REFERENCES encoding_entries(id) ON DELETE CASCADE;

ALTER TABLE encoding_entry_values 
  DROP CONSTRAINT IF EXISTS encoding_entry_values_column_fkey,
  ADD CONSTRAINT encoding_entry_values_column_fkey 
    FOREIGN KEY (column_id) REFERENCES encoding_columns(id) ON DELETE CASCADE;

-- monitoring_computed_metrics
ALTER TABLE monitoring_computed_metrics 
  DROP CONSTRAINT IF EXISTS monitoring_computed_metrics_monitoring_fkey,
  ADD CONSTRAINT monitoring_computed_metrics_monitoring_fkey 
    FOREIGN KEY (monitoring_id) REFERENCES monitoring_definitions(id) ON DELETE CASCADE;

ALTER TABLE monitoring_computed_metrics 
  DROP CONSTRAINT IF EXISTS monitoring_computed_metrics_column_fkey,
  ADD CONSTRAINT monitoring_computed_metrics_column_fkey 
    FOREIGN KEY (column_id) REFERENCES encoding_columns(id) ON DELETE CASCADE;

ALTER TABLE monitoring_computed_metrics 
  DROP CONSTRAINT IF EXISTS monitoring_computed_metrics_groupby_fkey,
  ADD CONSTRAINT monitoring_computed_metrics_groupby_fkey 
    FOREIGN KEY (groupby_column_id) REFERENCES encoding_columns(id) ON DELETE SET NULL;

ALTER TABLE monitoring_computed_metrics 
  DROP CONSTRAINT IF EXISTS monitoring_computed_metrics_operation_fkey,
  ADD CONSTRAINT monitoring_computed_metrics_operation_fkey 
    FOREIGN KEY (operation_id) REFERENCES computation_operations(id) ON DELETE SET NULL;

ALTER TABLE monitoring_computed_metrics 
  DROP CONSTRAINT IF EXISTS monitoring_computed_metrics_source_template_id_fkey,
  ADD CONSTRAINT monitoring_computed_metrics_source_template_id_fkey 
    FOREIGN KEY (source_template_id) REFERENCES encoding_templates(id) ON DELETE SET NULL;

-- monitoring_aggregations
ALTER TABLE monitoring_aggregations 
  DROP CONSTRAINT IF EXISTS monitoring_aggregations_metric_fkey,
  ADD CONSTRAINT monitoring_aggregations_metric_fkey 
    FOREIGN KEY (metric_id) REFERENCES monitoring_computed_metrics(id) ON DELETE CASCADE;

-- profiles
ALTER TABLE profiles 
  DROP CONSTRAINT IF EXISTS profiles_department_id_fkey,
  ADD CONSTRAINT profiles_department_id_fkey 
    FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL;

ALTER TABLE profiles 
  DROP CONSTRAINT IF EXISTS profiles_role_id_fkey,
  ADD CONSTRAINT profiles_role_id_fkey 
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE SET NULL;

-- =====================================================
-- STEP 5: Add helpful indexes for performance
-- =====================================================

-- Index for faster lookups of entries by template
CREATE INDEX IF NOT EXISTS idx_encoding_entries_template 
  ON encoding_entries(template_id, created_at DESC);

-- Index for faster lookups of values by entry
CREATE INDEX IF NOT EXISTS idx_encoding_entry_values_entry 
  ON encoding_entry_values(entry_id);

-- Index for faster lookups of values by column
CREATE INDEX IF NOT EXISTS idx_encoding_entry_values_column 
  ON encoding_entry_values(column_id);

-- Index for faster template column lookups
CREATE INDEX IF NOT EXISTS idx_encoding_template_columns_template 
  ON encoding_template_columns(template_id, display_order);

-- Index for faster column lookups by department
CREATE INDEX IF NOT EXISTS idx_encoding_columns_department 
  ON encoding_columns(department_id, display_order);

-- =====================================================
-- STEP 6: Add cell_color column to encoding_entry_values
-- =====================================================
-- This allows cell background colors to be saved and persisted

ALTER TABLE encoding_entry_values 
  ADD COLUMN IF NOT EXISTS cell_color TEXT;

-- =====================================================
-- STEP 7: Add column_computation table
-- =====================================================
-- This allows column computation settings to be saved and persisted

CREATE TABLE IF NOT EXISTS column_computation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES encoding_templates(id) ON DELETE CASCADE,
  column_id UUID NOT NULL REFERENCES encoding_columns(id) ON DELETE CASCADE,
  function_type TEXT NOT NULL CHECK (function_type IN ('sum', 'average', 'max', 'min', 'count')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (template_id, column_id)
);

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================

-- Check that unique constraint was added
SELECT conname, contype 
FROM pg_constraint 
WHERE conrelid = 'encoding_entry_values'::regclass;

-- Check cascade deletes are in place
SELECT 
  tc.table_name, 
  kcu.column_name, 
  ccu.table_name AS foreign_table_name,
  rc.delete_rule
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
JOIN information_schema.referential_constraints AS rc
  ON rc.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
ORDER BY tc.table_name;
