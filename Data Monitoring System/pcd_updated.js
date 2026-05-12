// =====================================================
// PCD MODULE - Updated for New Schema
// =====================================================

import { AppCore } from './core.js';
import { SupabaseService } from './supabase-service.js';
import { applyRoleRestrictions, requireAuth } from './auth-utils.js';

window.onload = async () => {
  await requireAuth();
  await applyRoleRestrictions();
  AppCore.initModule('PCD', 1); // Department 1 (adjust as needed)
};
