import { AppCore } from './core.js';
import { applyRoleRestrictions, requireAuth } from './auth-utils.js';

window.onload = async () => {
    await requireAuth();
    await applyRoleRestrictions();
    AppCore.initModule('Quality Assurance', 3); // departmentId = 3 for QA
};

window.toggleMenu = function(event, id) {
    event.stopPropagation();
    document.querySelectorAll(".dropdown").forEach(d => d.style.display = "none");
    const menu = document.getElementById(`menu-${id}`);
    if (menu) menu.style.display = "block";
};