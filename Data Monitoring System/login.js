import { supabaseClient, SupabaseService } from "./supabase-service.js";

const loginBtn = document.getElementById("loginBtn");
const errorMsg = document.getElementById("errorMsg");

loginBtn.addEventListener("click", async () => {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  // Reset error message
  errorMsg.style.display = "none";

  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email: email,
    password: password,
  });

  if (error) {
    errorMsg.textContent = error.message;
    errorMsg.style.display = "block";
  } else {
    // Update last login timestamp
    try {
      await SupabaseService.updateLastLogin(data.user.id);
    } catch (err) {
      console.error("Error updating last login:", err);
      // Don't block login if this fails
    }

    // Successful login
    window.location.href = "home.html";
  }
});
