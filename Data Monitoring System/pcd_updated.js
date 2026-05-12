// =====================================================
// PCD MODULE - Updated for New Schema
// =====================================================

import { AppCore } from "./core.js";
import { SupabaseService } from "./supabase-service.js";
import {
  applyRoleRestrictions,
  requireAuth,
  requireDepartmentAccess,
} from "./auth-utils.js";

window.onload = async () => {
  await requireAuth();
  await requireDepartmentAccess(1); // Department 1 for PCD
  await applyRoleRestrictions();
  AppCore.initModule("PCD", 1); // Department 1 (adjust as needed)
};
