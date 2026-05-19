// =====================================================
// AUTH UTILITIES - Role-based access control
// =====================================================

import { SupabaseService, supabaseClient } from "./supabase-service.js";

/**
 * Check if current user is authenticated
 * @returns {Promise<boolean>}
 */
export async function isAuthenticated() {
  try {
    const {
      data: { user },
    } = await supabaseClient.auth.getUser();
    return !!user;
  } catch (error) {
    console.error("Error checking authentication:", error);
    return false;
  }
}

/**
 * Redirect to login if not authenticated or account is inactive
 * Call this on page load for protected pages
 */
export async function requireAuth() {
  const authenticated = await isAuthenticated();
  if (!authenticated) {
    window.location.href = "login.html";
    return false;
  }

  // Check if account is active
  try {
    const profile = await getCurrentUserProfile();
    if (!profile || profile.status !== "active") {
      await supabaseClient.auth.signOut();
      window.location.href = "login.html";
      return false;
    }
  } catch (error) {
    console.error("Error checking account status:", error);
    await supabaseClient.auth.signOut();
    window.location.href = "login.html";
    return false;
  }

  return true;
}

/**
 * Get current user's profile with role and department
 * @returns {Promise<Object|null>}
 */
export async function getCurrentUserProfile() {
  try {
    return await SupabaseService.getCurrentUserProfile();
  } catch (error) {
    console.error("Error getting current user profile:", error);
    return null;
  }
}

/**
 * Check if current user is admin
 * @returns {Promise<boolean>}
 */
export async function isAdmin() {
  try {
    return await SupabaseService.isAdmin();
  } catch (error) {
    console.error("Error checking admin status:", error);
    return false;
  }
}

/**
 * Check if current user has a specific role
 * @param {string} roleName - Role name to check
 * @returns {Promise<boolean>}
 */
export async function hasRole(roleName) {
  try {
    const profile = await getCurrentUserProfile();
    return profile && profile.roles && profile.roles.role_name === roleName;
  } catch (error) {
    console.error("Error checking role:", error);
    return false;
  }
}

/**
 * Check if current user has any of the specified roles
 * @param {Array<string>} roleNames - Array of role names to check
 * @returns {Promise<boolean>}
 */
export async function hasAnyRole(roleNames) {
  try {
    const profile = await getCurrentUserProfile();
    if (!profile || !profile.roles) return false;
    return roleNames.includes(profile.roles.role_name);
  } catch (error) {
    console.error("Error checking roles:", error);
    return false;
  }
}

/**
 * Check if current user has access to a specific department
 * Admins can access all departments
 * Regular users can only access their assigned department
 * @param {number} departmentId - Department ID to check access for
 * @returns {Promise<boolean>}
 */
export async function hasDepartmentAccess(departmentId) {
  try {
    const profile = await getCurrentUserProfile();
    if (!profile) return false;

    // Admins can access all departments
    if (profile.roles && profile.roles.role_name === "admin") {
      return true;
    }

    // Users can only access their own department
    return profile.department_id === departmentId;
  } catch (error) {
    console.error("Error checking department access:", error);
    return false;
  }
}

/**
 * Require department access or redirect to home
 * @param {number} departmentId - Department ID required
 * @returns {Promise<boolean>}
 */
export async function requireDepartmentAccess(departmentId) {
  const hasAccess = await hasDepartmentAccess(departmentId);
  if (!hasAccess) {
    alert("You do not have permission to access this department");
    window.location.href = "index.html";
    return false;
  }
  return true;
}

/**
 * Hide elements for non-admin users
 * @param {string} selector - CSS selector for elements to hide
 */
export async function hideForNonAdmin(selector) {
  const admin = await isAdmin();
  if (!admin) {
    const elements = document.querySelectorAll(selector);
    elements.forEach((el) => (el.style.display = "none"));
  }
}

/**
 * Show elements for admin users only
 * @param {string} selector - CSS selector for elements to show
 */
export async function showForAdminOnly(selector) {
  const admin = await isAdmin();
  if (admin) {
    const elements = document.querySelectorAll(selector);
    elements.forEach((el) => (el.style.display = ""));
  } else {
    const elements = document.querySelectorAll(selector);
    elements.forEach((el) => (el.style.display = "none"));
  }
}

/**
 * Apply role-based UI restrictions
 * Call this on page load to hide admin-only features
 */
export async function applyRoleRestrictions() {
  const admin = await isAdmin();

  if (!admin) {
    // Hide template creation buttons
    const templateButtons = document.querySelectorAll(
      '.add-cat-btn[onclick*="openModal"]',
    );
    templateButtons.forEach((btn) => (btn.style.display = "none"));

    // Hide column creation buttons
    const columnButtons = document.querySelectorAll(
      '.add-cat-btn[onclick*="openColumnModal"]',
    );
    columnButtons.forEach((btn) => (btn.style.display = "none"));

    // Hide any other admin-only elements
    const adminOnlyElements = document.querySelectorAll("[data-admin-only]");
    adminOnlyElements.forEach((el) => (el.style.display = "none"));
  }
}
