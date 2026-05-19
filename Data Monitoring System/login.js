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
    // Check if account is active
    try {
      const profile = await SupabaseService.getCurrentUserProfile();
      if (!profile) {
        errorMsg.textContent = "User profile not found. Please contact administrator.";
        errorMsg.style.display = "block";
        await supabaseClient.auth.signOut();
        return;
      }

      if (profile.status !== "active") {
        errorMsg.textContent = "Your account has been deactivated. Please contact administrator.";
        errorMsg.style.display = "block";
        await supabaseClient.auth.signOut();
        return;
      }

      // Update last login timestamp
      await SupabaseService.updateLastLogin(data.user.id);
    } catch (err) {
      console.error("Error checking account status:", err);
      errorMsg.textContent = "Error verifying account status. Please try again.";
      errorMsg.style.display = "block";
      await supabaseClient.auth.signOut();
      return;
    }

    // Successful login
    window.location.href = "index.html";
  }
});
