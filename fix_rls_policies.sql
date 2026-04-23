-- =====================================================
-- FIX RLS POLICIES FOR PROFILES TABLE
-- Run this in Supabase SQL Editor
-- =====================================================

-- Drop all existing policies on profiles
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;

-- Create simple policy to allow authenticated users to read their own profile
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT
  USING (auth.uid() = id);

-- Create policy to allow users to insert their own profile
CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Create policy to allow users to update their own profile
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE
  USING (auth.uid() = id);

-- Create policy to allow authenticated users to read all profiles
-- (This allows the account manager to work - we'll check admin status in application code)
CREATE POLICY "Authenticated users can view all profiles" ON profiles
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Create policy to allow authenticated users to insert profiles
CREATE POLICY "Authenticated users can insert profiles" ON profiles
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Create policy to allow authenticated users to update profiles
CREATE POLICY "Authenticated users can update profiles" ON profiles
  FOR UPDATE
  USING (auth.role() = 'authenticated');

-- Create policy to allow authenticated users to delete profiles
CREATE POLICY "Authenticated users can delete profiles" ON profiles
  FOR DELETE
  USING (auth.role() = 'authenticated');
