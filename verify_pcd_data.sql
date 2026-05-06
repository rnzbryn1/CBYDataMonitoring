-- =====================================================
-- VERIFY & FIX: Existing data assigned to PCD department
-- Run this in Supabase SQL Editor BEFORE fix_sales_schema.sql
-- =====================================================

-- 1) CHECK current department distribution
SELECT 'encoding_templates' as table_name, department_id, COUNT(*) as count
FROM public.encoding_templates GROUP BY department_id
UNION ALL
SELECT 'encoding_entries', department_id, COUNT(*) 
FROM public.encoding_entries GROUP BY department_id
UNION ALL
SELECT 'encoding_columns', department_id, COUNT(*) 
FROM public.encoding_columns GROUP BY department_id
UNION ALL
SELECT 'encoding_template_columns', NULL, COUNT(*) 
FROM public.encoding_template_columns
ORDER BY table_name, department_id;

-- 2) FIX: Assign NULL/0/invalid department_ids to PCD (id=1)
-- Only run this if you see NULL or 0 in the results above!

-- UPDATE public.encoding_templates
-- SET department_id = 1
-- WHERE department_id IS NULL OR department_id = 0;

-- UPDATE public.encoding_entries
-- SET department_id = 1
-- WHERE department_id IS NULL OR department_id = 0;

-- UPDATE public.encoding_columns
-- SET department_id = 1
-- WHERE department_id IS NULL OR department_id = 0;
