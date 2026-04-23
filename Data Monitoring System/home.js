import { supabaseClient, SupabaseService } from './supabase-service.js';

// --- PROTECT THE PAGE ---
async function checkUser() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    
    if (!user) {
        // If no user is found, kick back to login
        window.location.href = 'login.html'; 
    }
}
checkUser();

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
            menu.appendChild(accountManagerLi);
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