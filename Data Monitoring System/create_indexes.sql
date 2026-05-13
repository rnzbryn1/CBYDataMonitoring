-- =====================================================
-- PERFORMANCE INDEXES FOR DATA MONITORING SYSTEM
-- =====================================================
-- Run this SQL in Supabase SQL Editor to improve query performance

-- Index for encoding_templates (frequently queried by department_id and ordered by created_at)
CREATE INDEX IF NOT EXISTS idx_encoding_templates_department_created 
ON public.encoding_templates(department_id, created_at DESC);

-- Index for encoding_templates (single template lookup by id)
CREATE INDEX IF NOT EXISTS idx_encoding_templates_id 
ON public.encoding_templates(id);

-- Index for encoding_templates (module filtering)
CREATE INDEX IF NOT EXISTS idx_encoding_templates_module 
ON public.encoding_templates(module);

-- Index for encoding_columns (frequently queried by department_id and ordered by display_order)
CREATE INDEX IF NOT EXISTS idx_encoding_columns_department_display 
ON public.encoding_columns(department_id, display_order ASC);

-- Index for encoding_columns (single column lookup by id)
CREATE INDEX IF NOT EXISTS idx_encoding_columns_id 
ON public.encoding_columns(id);

-- Index for encoding_columns (group_name filtering)
CREATE INDEX IF NOT EXISTS idx_encoding_columns_group_name 
ON public.encoding_columns(group_name);

-- Index for encoding_entries (frequently queried by template_id and ordered by created_at)
CREATE INDEX IF NOT EXISTS idx_encoding_entries_template_created 
ON public.encoding_entries(template_id, created_at DESC);

-- Index for encoding_entries (reference_number lookup for monitoring)
CREATE INDEX IF NOT EXISTS idx_encoding_entries_template_reference 
ON public.encoding_entries(template_id, reference_number);

-- Index for encoding_entries (status filtering)
CREATE INDEX IF NOT EXISTS idx_encoding_entries_status 
ON public.encoding_entries(status);

-- Index for encoding_entry_values (frequently queried by entry_id)
CREATE INDEX IF NOT EXISTS idx_encoding_entry_values_entry_id 
ON public.encoding_entry_values(entry_id);

-- Index for encoding_entry_values (frequently queried by column_id)
CREATE INDEX IF NOT EXISTS idx_encoding_entry_values_column_id 
ON public.encoding_entry_values(column_id);

-- Composite index for encoding_entry_values (entry_id, column_id) - most common query pattern
CREATE INDEX IF NOT EXISTS idx_encoding_entry_values_entry_column 
ON public.encoding_entry_values(entry_id, column_id);

-- Index for encoding_template_columns (template_id lookups)
CREATE INDEX IF NOT EXISTS idx_encoding_template_columns_template 
ON public.encoding_template_columns(template_id);

-- Index for encoding_template_columns (column_id lookups)
CREATE INDEX IF NOT EXISTS idx_encoding_template_columns_column 
ON public.encoding_template_columns(column_id);

-- Index for profiles (department_id lookups)
CREATE INDEX IF NOT EXISTS idx_profiles_department_id 
ON public.profiles(department_id);

-- Index for profiles (role_id lookups)
CREATE INDEX IF NOT EXISTS idx_profiles_role_id 
ON public.profiles(role_id);

-- Index for profiles (status filtering)
CREATE INDEX IF NOT EXISTS idx_profiles_status 
ON public.profiles(status);

-- Index for profiles (is_hidden filtering)
CREATE INDEX IF NOT EXISTS idx_profiles_is_hidden 
ON public.profiles(is_hidden);

-- =====================================================
-- INDEX MAINTENANCE
-- =====================================================

-- Analyze tables to update statistics after creating indexes
ANALYZE public.encoding_templates;
ANALYZE public.encoding_columns;
ANALYZE public.encoding_entries;
ANALYZE public.encoding_entry_values;
ANALYZE public.encoding_template_columns;
ANALYZE public.profiles;
