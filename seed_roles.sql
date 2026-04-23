    -- =====================================================
    -- SEED ROLES - Admin and User roles only
    -- Run this in Supabase SQL Editor
    -- =====================================================

    -- Insert admin role if it doesn't exist
    INSERT INTO public.roles (role_name, description)
    VALUES ('admin', 'Administrator with full access to account management')
    ON CONFLICT (role_name) DO NOTHING;

    -- Insert user role if it doesn't exist
    INSERT INTO public.roles (role_name, description)
    VALUES ('user', 'Standard user with limited access')
    ON CONFLICT (role_name) DO NOTHING;

    -- Verify roles were created
    SELECT * FROM public.roles ORDER BY role_name;
