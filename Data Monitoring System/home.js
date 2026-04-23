import { supabaseClient, SupabaseService } from './supabase-service.js';
import { requireAuth } from './auth-utils.js';

// --- PROTECT THE PAGE ---
requireAuth();

// --- SHOW ACCOUNT MANAGER FOR ADMIN ONLY ---
async function showAccountManagerLink() {
    try {
        const isAdmin = await SupabaseService.isAdmin();
        console.log('Is admin:', isAdmin);
        if (isAdmin) {
            const menu = document.querySelector('.menu');
            const accountManagerLi = document.createElement('li');
            accountManagerLi.onclick = function() { window.loadPage(this, 'accountmanager.html'); };
            accountManagerLi.textContent = 'Account Manager';
            // Insert before the logout button
            const logoutBtn = menu.querySelector('.logout-btn');
            if (logoutBtn) {
                menu.insertBefore(accountManagerLi, logoutBtn);
            } else {
                menu.appendChild(accountManagerLi);
            }
        }
    } catch (error) {
        console.error('Error checking admin status:', error.message);
        console.error('Full error:', error);
    }
}
showAccountManagerLink();

// --- LOGOUT ---
// Attached to window so it can be called from HTML onclick
window.logout = async function() {
    await supabaseClient.auth.signOut();
    window.location.href = 'login.html';
};

// --- NAVIGATION ---
window.loadPage = function(element, page) {
    document.getElementById("contentFrame").src = page;

    document.querySelectorAll(".menu li").forEach(li => {
        li.classList.remove("active");
    });

    element.classList.add("active");
};