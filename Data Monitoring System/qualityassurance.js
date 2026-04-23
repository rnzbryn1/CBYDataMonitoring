import { AppCore } from './core.js';
import { applyRoleRestrictions } from './auth-utils.js';

window.onload = async () => {
    await applyRoleRestrictions();
    AppCore.init('QA');
};

window.toggleMenu = function(event, id) {
    event.stopPropagation();
    document.querySelectorAll(".dropdown").forEach(d => d.style.display = "none");
    const menu = document.getElementById(`menu-${id}`);
    if (menu) menu.style.display = "block";
};