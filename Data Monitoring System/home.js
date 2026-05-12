import { supabaseClient, SupabaseService } from "./supabase-service.js";
import { requireAuth, hasDepartmentAccess, isAdmin } from "./auth-utils.js";

// --- PROTECT THE PAGE ---
requireAuth();

// Department page mapping
const departmentPages = {
  1: "pcd.html",
  2: "salesdesk.html",
  3: "engineering.html",
  5: "dst.html",
};

const departmentNames = {
  1: "PCD",
  2: "Sales Desk",
  3: "Engineering",
  5: "DST",
};

// --- LOAD USER'S DEPARTMENT ---
async function loadUserDepartment() {
  try {
    const profile = await SupabaseService.getCurrentUserProfile();
    if (!profile) {
      console.error("User profile not found");
      return;
    }

    const userDepartmentId = profile.department_id;
    const userRole = profile.roles?.role_name;

    // If admin, load sales desk as default (or could show a dashboard)
    // If regular user, load their assigned department
    let defaultPage;
    let defaultDepartmentId;

    if (userRole === "admin") {
      // Admins can access all departments, default to sales desk
      defaultPage = "salesdesk.html";
      defaultDepartmentId = 2;
    } else if (userDepartmentId && departmentPages[userDepartmentId]) {
      // Regular users load their assigned department
      defaultPage = departmentPages[userDepartmentId];
      defaultDepartmentId = userDepartmentId;
    } else {
      // Fallback to sales desk if no department assigned
      defaultPage = "salesdesk.html";
      defaultDepartmentId = 2;
    }

    // Load the page
    const iframe = document.getElementById("contentFrame");
    if (iframe) {
      iframe.src = defaultPage;
    }

    // Set the correct menu item as active
    const menuItems = document.querySelectorAll(".menu li");
    menuItems.forEach((li) => {
      li.classList.remove("active");
      if (li.textContent.trim() === departmentNames[defaultDepartmentId]) {
        li.classList.add("active");
      }
    });

    // Hide menu items for departments user doesn't have access to
    await hideInaccessibleDepartments(profile);
  } catch (error) {
    console.error("Error loading user department:", error);
    // Fallback to sales desk on error
    document.getElementById("contentFrame").src = "salesdesk.html";
  }
}

// --- HIDE INACCESSIBLE DEPARTMENTS FROM MENU ---
async function hideInaccessibleDepartments(profile) {
  try {
    const userRole = profile.roles?.role_name;
    const userDepartmentId = profile.department_id;

    // Admins see all departments
    if (userRole === "admin") {
      return;
    }

    // Regular users only see their department
    const menuItems = document.querySelectorAll(".menu li");
    menuItems.forEach((li) => {
      const text = li.textContent.trim();
      const deptName = departmentNames[userDepartmentId];

      // Hide all menu items except the user's department
      if (text !== deptName && text !== "Logout") {
        li.style.display = "none";
      }
    });
  } catch (error) {
    console.error("Error hiding inaccessible departments:", error);
  }
}

// --- SHOW ACCOUNT MANAGER FOR ADMIN ONLY ---
async function showAccountManagerLink() {
  try {
    const admin = await isAdmin();
    console.log("Is admin:", admin);
    if (admin) {
      const menu = document.querySelector(".menu");
      const accountManagerLi = document.createElement("li");
      accountManagerLi.onclick = function () {
        window.loadPage(this, "accountmanager.html");
      };
      accountManagerLi.textContent = "Account Manager";
      // Insert before the logout button
      const logoutBtn = menu.querySelector(".logout-btn");
      if (logoutBtn) {
        menu.insertBefore(accountManagerLi, logoutBtn);
      } else {
        menu.appendChild(accountManagerLi);
      }
    }
  } catch (error) {
    console.error("Error checking admin status:", error.message);
    console.error("Full error:", error);
  }
}

// --- LOGOUT ---
// Attached to window so it can be called from HTML onclick
window.logout = async function () {
  await supabaseClient.auth.signOut();
  window.location.href = "login.html";
};

// --- NAVIGATION ---
window.loadPage = function (element, page) {
  document.getElementById("contentFrame").src = page;

  document.querySelectorAll(".menu li").forEach((li) => {
    li.classList.remove("active");
  });

  element.classList.add("active");
};

// --- INITIALIZE ---
// Load user's department and show account manager link
Promise.all([loadUserDepartment(), showAccountManagerLink()]);
