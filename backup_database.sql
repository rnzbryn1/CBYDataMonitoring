-- =====================================================
-- BACKUP DATABASE BEFORE SCHEMA CHANGES
-- Run this in Supabase SQL Editor
-- =====================================================

-- Note: Supabase automatically creates point-in-time backups.
-- This script creates explicit data exports you can restore manually if needed.

-- =====================================================
-- 1. EXPORT ALL TABLE STRUCTURES
-- =====================================================

-- Get all public tables with their definitions
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable,
    column_default,
    character_maximum_length,
    numeric_precision,
    numeric_scale
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name IN (
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
  )
ORDER BY table_name, ordinal_position;

-- =====================================================
-- 2. EXPORT ALL DATA
-- =====================================================

-- Export departments
SELECT * FROM public.departments ORDER BY id;

-- Export roles
SELECT * FROM public.roles ORDER BY id;

-- Export profiles
SELECT * FROM public.profiles ORDER BY created_at;

-- Export encoding_templates
SELECT * FROM public.encoding_templates ORDER BY created_at;

-- Export encoding_columns
SELECT * FROM public.encoding_columns ORDER BY department_id, display_order;

-- Export encoding_template_columns
SELECT * FROM public.encoding_template_columns ORDER BY template_id, display_order;

-- Export encoding_entries
SELECT * FROM public.encoding_entries ORDER BY template_id, created_at;

-- Export encoding_entry_values
SELECT * FROM public.encoding_entry_values ORDER BY entry_id, column_id;

-- Export template_formulas
SELECT * FROM public.template_formulas ORDER BY created_at;

-- Export any remaining old tables (if they exist)
SELECT 'cell_formulas' as table_name, COUNT(*) as row_count FROM public.cell_formulas
UNION ALL
SELECT 'column_computation' as table_name, COUNT(*) as row_count FROM public.column_computation
UNION ALL
SELECT 'computation_operations' as table_name, COUNT(*) as row_count FROM public.computation_operations
UNION ALL
SELECT 'monitoring_definitions' as table_name, COUNT(*) as row_count FROM public.monitoring_definitions
UNION ALL
SELECT 'monitoring_computed_metrics' as table_name, COUNT(*) as row_count FROM public.monitoring_computed_metrics
UNION ALL
SELECT 'monitoring_aggregations' as table_name, COUNT(*) as row_count FROM public.monitoring_aggregations;

-- =====================================================
-- 3. EXPORT CONSTRAINTS AND INDEXES
-- =====================================================

-- Get all foreign key constraints
SELECT 
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name,
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

-- Get all unique constraints
SELECT 
    tc.table_name,
    ccu.column_name,
    tc.constraint_name
FROM information_schema.table_constraints tc
JOIN information_schema.constraint_column_usage ccu
    ON tc.constraint_name = ccu.constraint_name
WHERE tc.constraint_type = 'UNIQUE'
  AND tc.table_schema = 'public'
ORDER BY tc.table_name;

-- Get all indexes
SELECT 
    tablename,
    indexname,
    indexdef
FROM pg_indexes 
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

-- =====================================================
-- 4. BACKUP INSTRUCTIONS
-- =====================================================

/*
HOW TO RESTORE FROM THIS BACKUP:

1. Save all query results to separate files:
   - Table structures (schema)
   - Table data (each table)
   - Constraints and indexes

2. If you need to restore:
   a) Drop all tables in reverse dependency order
   b) Recreate tables using the structure export
   c) Insert data using the data exports
   d) Recreate constraints and indexes

3. Alternative: Use Supabase Dashboard
   - Go to Settings > Database > Backups
   - Create a manual backup before running schema changes
   - You can restore to this point if needed

4. Point-in-time recovery:
   - Supabase automatically keeps PITR for 30 days
   - You can restore to any point in time via dashboard
*/

-- =====================================================
-- 5. VERIFICATION
-- =====================================================

-- Count total records in each table for quick verification
SELECT 
    schemaname,
    tablename,
    n_tup_ins as inserts,
    n_tup_upd as updates,
    n_tup_del as deletes,
    n_live_tup as current_rows,
    n_dead_tup as dead_rows
FROM pg_stat_user_tables 
WHERE schemaname = 'public'
ORDER BY tablename;
