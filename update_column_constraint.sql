-- =====================================================
-- UPDATE COLUMN CONSTRAINT TO ALLOW DUPLICATES IN DIFFERENT GROUPS
-- Run this in Supabase SQL Editor
-- =====================================================
-- This allows the same column name to exist in different groups within the same department
-- Example: "Price" can exist in both "buying" group and "selling" group in PCD department

-- First, check if there's an existing unique constraint on encoding_columns
SELECT conname, contype, pg_get_constraintdef(oid) as constraint_def
FROM pg_constraint
WHERE conrelid = 'encoding_columns'::regclass
AND contype = 'u';

-- Drop the existing unique constraint if it exists
-- The constraint name might vary, so we drop it by checking common names
ALTER TABLE encoding_columns
  DROP CONSTRAINT IF EXISTS encoding_columns_column_name_key;
ALTER TABLE encoding_columns
  DROP CONSTRAINT IF EXISTS encoding_columns_department_id_column_name_key;
ALTER TABLE encoding_columns
  DROP CONSTRAINT IF EXISTS encoding_columns_dept_col_group_unique;
ALTER TABLE encoding_columns
  DROP CONSTRAINT IF EXISTS encoding_columns_unique_per_dept;

-- Add a new unique constraint that includes group_name
-- This allows duplicate column names as long as they're in different groups
ALTER TABLE encoding_columns
  ADD CONSTRAINT encoding_columns_dept_col_group_unique
  UNIQUE (department_id, column_name, group_name);

-- Verify the new constraint
SELECT conname, contype, pg_get_constraintdef(oid) as constraint_def
FROM pg_constraint
WHERE conrelid = 'encoding_columns'::regclass
AND contype = 'u';
