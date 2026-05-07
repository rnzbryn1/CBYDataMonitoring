-- =====================================================
-- ADD linkage_type TO encoding_template_columns
-- Run this in Supabase SQL Editor
-- =====================================================
-- This fixes the bug where adding a "new" column in monitoring
-- with the same name as an encoding column incorrectly auto-syncs data.
-- 
-- linkage_type = 'linked'    => Column explicitly added from encoding (auto-sync enabled)
-- linkage_type = 'independent' => New column created in monitoring (auto-sync disabled)

-- 1. Add the new column with default 'linked' for backward compatibility
ALTER TABLE public.encoding_template_columns
ADD COLUMN IF NOT EXISTS linkage_type text DEFAULT 'linked';

-- 2. Backfill existing rows that have NULL linkage_type
UPDATE public.encoding_template_columns
SET linkage_type = 'linked'
WHERE linkage_type IS NULL;

-- 3. Add check constraint to ensure only valid values
ALTER TABLE public.encoding_template_columns
DROP CONSTRAINT IF EXISTS encoding_template_columns_linkage_type_check;

ALTER TABLE public.encoding_template_columns
ADD CONSTRAINT encoding_template_columns_linkage_type_check
CHECK (linkage_type IN ('linked', 'independent'));

-- 4. Verify the migration
SELECT 
    template_id,
    column_id,
    display_order,
    linkage_type,
    COUNT(*) as count
FROM public.encoding_template_columns
GROUP BY template_id, column_id, display_order, linkage_type
ORDER BY count DESC
LIMIT 10;
