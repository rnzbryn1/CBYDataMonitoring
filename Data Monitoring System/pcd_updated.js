// =====================================================
// PCD MODULE - Updated for New Schema
// =====================================================

import { AppCore } from './core.js';
import { SupabaseService } from './supabase-service.js';

window.onload = () => {
  // Initialize with module name and department ID
  AppCore.initModule('PCD', 1); // Department 1 (adjust as needed)
};
