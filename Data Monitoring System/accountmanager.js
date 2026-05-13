import { SupabaseService, supabaseClient } from "./supabase-service.js";
import { requireAuth } from "./auth-utils.js";

const form = document.getElementById("createUserForm");
const usersList = document.getElementById("usersList");
const departmentSelect = document.getElementById("department");
const roleSelect = document.getElementById("role");
const toggleCreateBtn = document.getElementById("toggleCreateForm");
const cancelCreateBtn = document.getElementById("cancelCreate");
const createUserCard = document.getElementById("createUserCard");
const resetPasswordModal = document.getElementById("resetPasswordModal");
const resetPasswordForm = document.getElementById("resetPasswordForm");
let currentResetUserId = null;

// Check if user is admin on page load
async function checkAdminAccess() {
  try {
    const isAdmin = await SupabaseService.isAdmin();
    if (!isAdmin) {
      document.body.innerHTML = `
                <div class="container">
                    <div class="card">
                        <h2>Access Denied</h2>
                        <p>You do not have permission to access this page. Only administrators can manage user accounts.</p>
                        <button onclick="window.location.href='home.html'" class="btn btn-primary" style="margin-top: 20px;">Return to Home</button>
                    </div>
                </div>
            `;
      return false;
    }
    return true;
  } catch (error) {
    console.error("Error checking admin access:", error);
    document.body.innerHTML = `
            <div class="container">
                <div class="card">
                    <h2>Error</h2>
                    <p>Failed to verify permissions. Please try logging in again.</p>
                    <button onclick="window.location.href='login.html'" class="btn btn-primary" style="margin-top: 20px;">Go to Login</button>
                </div>
            </div>
        `;
    return false;
  }
}

// Load departments and roles
async function loadFormOptions() {
  try {
    const [departments, roles] = await Promise.all([
      SupabaseService.getDepartments(),
      SupabaseService.getRoles(),
    ]);

    // Populate department dropdown
    departments.forEach((dept) => {
      const option = document.createElement("option");
      option.value = dept.id;
      option.textContent = dept.name;
      departmentSelect.appendChild(option);
    });

    // Populate role dropdown (show all roles for admin to choose)
    roles.forEach((role) => {
      const option = document.createElement("option");
      option.value = role.id;
      option.textContent = role.description || role.role_name;
      roleSelect.appendChild(option);
    });
  } catch (error) {
    console.error("Error loading form options:", error);
    showError("Failed to load departments and roles");
  }
}

// Load all users
async function loadUsers() {
  try {
    const users = await SupabaseService.getAllUsers();
    // Get current user ID
    const {
      data: { user },
    } = await supabaseClient.auth.getUser();
    const currentUserId = user?.id;
    renderUsersTable(users, currentUserId);
  } catch (error) {
    console.error("Error loading users:", error);
    usersList.innerHTML =
      '<p class="error-message">Failed to load users. Please try again.</p>';
  }
}

// Render users table
function renderUsersTable(users, currentUserId) {
  if (!users || users.length === 0) {
    usersList.innerHTML =
      '<p class="empty-state">No users found. Create your first user above.</p>';
    return;
  }

  let html = `
        <table class="users-table">
            <thead>
                <tr>
                    <th>Username</th>
                    <th>Department</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Last Login</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
    `;

  users.forEach((user) => {
    const department = user.departments?.name || "All Departments";
    const role = user.roles?.role_name || "N/A";
    const status = user.status || "active";
    const createdAt = new Date(user.created_at).toLocaleDateString();
    const lastLogin = user.last_login
      ? new Date(user.last_login).toLocaleDateString()
      : "Never";
    const isCurrentUser = user.id === currentUserId;

    html += `
            <tr>
                <td>${user.username}</td>
                <td>${department}</td>
                <td><span class="role-badge ${role}">${role}</span></td>
                <td><span class="status-badge ${status}">${status}</span></td>
                <td>${createdAt}</td>
                <td>${lastLogin}</td>
                <td class="actions-cell">
                    ${
                      isCurrentUser
                        ? '<span style="color: #999; font-size: 12px;">(Current User)</span>'
                        : `
                            <button onclick="window.openResetPasswordModal('${user.id}', '${user.username}')" class="btn btn-primary" style="font-size: 11px; padding: 4px 8px; margin-right: 5px;">Reset Password</button>
                            ${
                              status === "active"
                                ? `<button onclick="window.toggleUserStatus('${user.id}', 'inactive')" class="btn btn-danger" style="font-size: 11px; padding: 4px 8px; margin-right: 5px;">Deactivate</button>`
                                : `<button onclick="window.toggleUserStatus('${user.id}', 'active')" class="btn btn-primary" style="font-size: 11px; padding: 4px 8px; margin-right: 5px;">Activate</button>`
                            }
                            <button onclick="window.deleteUser('${user.id}', '${user.username}')" class="btn btn-danger" style="font-size: 11px; padding: 4px 8px; background: #c0392b;">Delete</button>
                          `
                    }
                </td>
            </tr>
        `;
  });

  html += "</tbody></table>";
  usersList.innerHTML = html;
}

// Show error message
function showError(message) {
  const errorDiv = document.createElement("div");
  errorDiv.className = "error-message";
  errorDiv.textContent = message;
  form.insertBefore(errorDiv, form.firstChild);
  setTimeout(() => errorDiv.remove(), 5000);
}

// Show success message
function showSuccess(message) {
  const successDiv = document.createElement("div");
  successDiv.className = "success-message";
  successDiv.textContent = message;
  form.insertBefore(successDiv, form.firstChild);
  setTimeout(() => successDiv.remove(), 5000);
}

// Toggle create form visibility
toggleCreateBtn.addEventListener("click", () => {
  createUserCard.style.display = "block";
  toggleCreateBtn.style.display = "none";
});

// Cancel create form
cancelCreateBtn.addEventListener("click", () => {
  createUserCard.style.display = "none";
  toggleCreateBtn.style.display = "block";
  form.reset();
});

// Handle form submission
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  const departmentId = parseInt(document.getElementById("department").value);
  const roleId = parseInt(document.getElementById("role").value);

  // Check if creating admin account
  const selectedRoleText =
    roleSelect.options[roleSelect.selectedIndex].text.toLowerCase();
  const isAdminRole = selectedRoleText.includes("admin");

  if (isAdminRole) {
    const confirmed = confirm(
      "⚠️ WARNING: You are about to create an ADMIN account.\n\n" +
        "Admin users have full access to:\n" +
        "- Create and delete templates\n" +
        "- Add and remove columns\n" +
        "- Manage all user accounts\n" +
        "- Access all system features\n\n" +
        "Are you sure you want to proceed?",
    );

    if (!confirmed) {
      return; // Cancel the operation
    }
  }

  try {
    await SupabaseService.createUser(
      email,
      password,
      email,
      departmentId,
      roleId,
    );
    showSuccess("User created successfully!");
    form.reset();
    createUserCard.style.display = "none";
    toggleCreateBtn.style.display = "block";
    loadUsers(); // Refresh the users list
  } catch (error) {
    console.error("Error creating user:", error);
    showError(error.message || "Failed to create user. Please try again.");
  }
});

// Toggle user status (activate/deactivate)
window.toggleUserStatus = async function (userId, newStatus) {
  try {
    console.log("Toggling user status:", userId, newStatus);
    await SupabaseService.updateUserProfile(userId, { status: newStatus });
    showSuccess(
      `User ${newStatus === "active" ? "activated" : "deactivated"} successfully`,
    );
    loadUsers();
  } catch (error) {
    console.error("Error updating user status:", error);
    console.error("Error details:", error.message, error.code, error.hint);
    showError(
      `Failed to update user status: ${error.message || "Please try again."}`,
    );
  }
};

// Open reset password modal
window.openResetPasswordModal = function (userId, username) {
  currentResetUserId = userId;
  document.getElementById("resetPasswordUserEmail").textContent =
    `Resetting password for: ${username}`;
  document.getElementById("newPassword").value = "";
  document.getElementById("confirmPassword").value = "";
  resetPasswordModal.style.display = "block";
};

// Close reset password modal
window.closeResetPasswordModal = function () {
  resetPasswordModal.style.display = "none";
  resetPasswordForm.reset();
  currentResetUserId = null;
};

// Handle reset password form submission
resetPasswordForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const newPassword = document.getElementById("newPassword").value;
  const confirmPassword = document.getElementById("confirmPassword").value;
  const messageDiv = document.getElementById("resetPasswordMessage");

  // Clear previous messages
  messageDiv.className = "";
  messageDiv.textContent = "";

  if (newPassword !== confirmPassword) {
    messageDiv.className = "error-message";
    messageDiv.textContent = "Passwords do not match";
    return;
  }

  if (newPassword.length < 6) {
    messageDiv.className = "error-message";
    messageDiv.textContent = "Password must be at least 6 characters";
    return;
  }

  try {
    await SupabaseService.resetUserPassword(currentResetUserId, newPassword);
    messageDiv.className = "success-message";
    messageDiv.textContent = "Password reset successfully!";
    setTimeout(() => {
      closeResetPasswordModal();
    }, 1500);
  } catch (error) {
    console.error("Error resetting password:", error);
    messageDiv.className = "error-message";
    messageDiv.textContent = error.message || "Failed to reset password. Please try again.";
  }
});

// Delete user
window.deleteUser = async function (userId, username) {
  const confirmed = confirm(
    `⚠️ WARNING: You are about to PERMANENTLY delete the account for: ${username}\n\n` +
      "This action cannot be undone. The user will lose access to the system immediately.\n\n" +
      "Are you sure you want to proceed?",
  );

  if (!confirmed) {
    return;
  }

  try {
    await SupabaseService.deleteUser(userId);
    showSuccess("User deleted successfully");
    loadUsers();
  } catch (error) {
    console.error("Error deleting user:", error);
    showError(error.message || "Failed to delete user. Please try again.");
  }
};

// Initialize page
async function init() {
  await requireAuth();
  const hasAccess = await checkAdminAccess();
  if (hasAccess) {
    await Promise.all([loadFormOptions(), loadUsers()]);
  }
}

init();
