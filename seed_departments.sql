-- =====================================================
-- SEED DEPARTMENTS - PCD, Sales Desk, DST
-- Run this in Supabase SQL Editor
-- =====================================================

-- 1) Ensure the sequence exists (safe to run even if it already exists)
CREATE SEQUENCE IF NOT EXISTS public.departments_id_seq;

-- 2) Seed departments with explicit IDs that match the JS modules
INSERT INTO public.departments (id, name, description)
VALUES
    (1, 'PCD', 'Product Control and Development'),
    (2, 'Sales Desk', 'Sales Order Desk department'),
    (5, 'DST', 'Distribution and Sales Tracking')
ON CONFLICT (id) DO UPDATE
    SET name = EXCLUDED.name,
        description = EXCLUDED.description;

-- 3) Advance the sequence past the highest explicit ID so future auto-inserts don't collide
SELECT setval('public.departments_id_seq', COALESCE((SELECT MAX(id) FROM public.departments), 1), true);

-- 4) Verify
SELECT * FROM public.departments ORDER BY id;
