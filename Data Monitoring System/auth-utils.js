// =====================================================
// AUTH UTILITIES - Role-based access control
// =====================================================

import { SupabaseService } from './supabase-service.js';

/**
 * Check if current user is admin
 * @returns {Promise<boolean>}
 */
export async function isAdmin() {
    try {
        return await SupabaseService.isAdmin();
    } catch (error) {
        console.error('Error checking admin status:', error);
        return false;
    }
}

/**
 * Hide elements for non-admin users
 * @param {string} selector - CSS selector for elements to hide
 */
export async function hideForNonAdmin(selector) {
    const admin = await isAdmin();
    if (!admin) {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => el.style.display = 'none');
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
        elements.forEach(el => el.style.display = '');
    } else {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => el.style.display = 'none');
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
        const templateButtons = document.querySelectorAll('.add-cat-btn[onclick*="openModal"]');
        templateButtons.forEach(btn => btn.style.display = 'none');
        
        // Hide column creation buttons
        const columnButtons = document.querySelectorAll('.add-cat-btn[onclick*="openColumnModal"]');
        columnButtons.forEach(btn => btn.style.display = 'none');
        
        // Hide any other admin-only elements
        const adminOnlyElements = document.querySelectorAll('[data-admin-only]');
        adminOnlyElements.forEach(el => el.style.display = 'none');
    }
}
