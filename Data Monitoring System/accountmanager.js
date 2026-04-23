import { SupabaseService, supabaseClient } from './supabase-service.js';

const form = document.getElementById('createUserForm');
const usersList = document.getElementById('usersList');
const departmentSelect = document.getElementById('department');
const roleSelect = document.getElementById('role');
const toggleCreateBtn = document.getElementById('toggleCreateForm');
const cancelCreateBtn = document.getElementById('cancelCreate');
const createUserCard = document.getElementById('createUserCard');

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
        console.error('Error checking admin access:', error);
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
            SupabaseService.getRoles()
        ]);

        // Populate department dropdown
        departments.forEach(dept => {
            const option = document.createElement('option');
            option.value = dept.id;
            option.textContent = dept.name;
            departmentSelect.appendChild(option);
        });

        // Populate role dropdown (only show 'user' role for new users)
        roles.forEach(role => {
            if (role.role_name === 'user') {
                const option = document.createElement('option');
                option.value = role.id;
                option.textContent = role.description || role.role_name;
                roleSelect.appendChild(option);
            }
        });
    } catch (error) {
        console.error('Error loading form options:', error);
        showError('Failed to load departments and roles');
    }
}

// Load all users
async function loadUsers() {
    try {
        const users = await SupabaseService.getAllUsers();
        // Get current user ID
        const { data: { user } } = await supabaseClient.auth.getUser();
        const currentUserId = user?.id;
        renderUsersTable(users, currentUserId);
    } catch (error) {
        console.error('Error loading users:', error);
        usersList.innerHTML = '<p class="error-message">Failed to load users. Please try again.</p>';
    }
}

// Render users table
function renderUsersTable(users, currentUserId) {
    if (!users || users.length === 0) {
        usersList.innerHTML = '<p class="empty-state">No users found. Create your first user above.</p>';
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
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
    `;

    users.forEach(user => {
        const department = user.departments?.name || 'All Departments';
        const role = user.roles?.role_name || 'N/A';
        const status = user.status || 'active';
        const createdAt = new Date(user.created_at).toLocaleDateString();
        const isCurrentUser = user.id === currentUserId;

        html += `
            <tr>
                <td>${user.username}</td>
                <td>${department}</td>
                <td><span class="role-badge ${role}">${role}</span></td>
                <td><span class="status-badge ${status}">${status}</span></td>
                <td>${createdAt}</td>
                <td class="actions-cell">
                    ${isCurrentUser ? 
                        '<span style="color: #999; font-size: 12px;">(Current User)</span>' :
                        (status === 'active' ? 
                            `<button onclick="window.toggleUserStatus('${user.id}', 'inactive')" class="btn btn-danger">Deactivate</button>` :
                            `<button onclick="window.toggleUserStatus('${user.id}', 'active')" class="btn btn-primary" style="font-size: 12px; padding: 6px 12px;">Activate</button>`
                        )
                    }
                </td>
            </tr>
        `;
    });

    html += '</tbody></table>';
    usersList.innerHTML = html;
}

// Show error message
function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    form.insertBefore(errorDiv, form.firstChild);
    setTimeout(() => errorDiv.remove(), 5000);
}

// Show success message
function showSuccess(message) {
    const successDiv = document.createElement('div');
    successDiv.className = 'success-message';
    successDiv.textContent = message;
    form.insertBefore(successDiv, form.firstChild);
    setTimeout(() => successDiv.remove(), 5000);
}

// Toggle create form visibility
toggleCreateBtn.addEventListener('click', () => {
    createUserCard.style.display = 'block';
    toggleCreateBtn.style.display = 'none';
});

// Cancel create form
cancelCreateBtn.addEventListener('click', () => {
    createUserCard.style.display = 'none';
    toggleCreateBtn.style.display = 'block';
    form.reset();
});

// Handle form submission
form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const departmentId = parseInt(document.getElementById('department').value);
    const roleId = parseInt(document.getElementById('role').value);

    try {
        await SupabaseService.createUser(email, password, email, departmentId, roleId);
        showSuccess('User created successfully!');
        form.reset();
        createUserCard.style.display = 'none';
        toggleCreateBtn.style.display = 'block';
        loadUsers(); // Refresh the users list
    } catch (error) {
        console.error('Error creating user:', error);
        showError(error.message || 'Failed to create user. Please try again.');
    }
});

// Toggle user status (activate/deactivate)
window.toggleUserStatus = async function(userId, newStatus) {
    try {
        console.log('Toggling user status:', userId, newStatus);
        await SupabaseService.updateUserProfile(userId, { status: newStatus });
        showSuccess(`User ${newStatus === 'active' ? 'activated' : 'deactivated'} successfully`);
        loadUsers();
    } catch (error) {
        console.error('Error updating user status:', error);
        console.error('Error details:', error.message, error.code, error.hint);
        showError(`Failed to update user status: ${error.message || 'Please try again.'}`);
    }
};

// Initialize page
async function init() {
    const hasAccess = await checkAdminAccess();
    if (hasAccess) {
        await Promise.all([
            loadFormOptions(),
            loadUsers()
        ]);
    }
}

init();
