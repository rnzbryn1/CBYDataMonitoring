import { AppCore } from './core.js';
import { applyRoleRestrictions } from './auth-utils.js';

window.onload = async () => {
    await applyRoleRestrictions();
    AppCore.init('Sales'); // Eto lang, tapos na!
};