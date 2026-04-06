import { SUPABASE_CONFIG } from './config.js';

// Access createClient from the CDN global variable
const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);

const loginBtn = document.getElementById('loginBtn');
const errorMsg = document.getElementById('errorMsg');

loginBtn.addEventListener('click', async () => {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    // Reset error message
    errorMsg.style.display = 'none';

    const { data, error } = await supabaseClient.auth.signInWithPassword({
        email: email,
        password: password,
    });

    if (error) {
        errorMsg.textContent = error.message;
        errorMsg.style.display = 'block';
    } else {
        // Successful login
        window.location.href = 'home.html';
    }
});