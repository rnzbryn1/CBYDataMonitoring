import { SUPABASE_CONFIG } from './config.js';

const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);

// --- PROTECT THE PAGE ---
async function checkUser() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    
    if (!user) {
        // If no user is found, kick back to login
        window.location.href = 'login.html'; 
    }
}
checkUser();

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