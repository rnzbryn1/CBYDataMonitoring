// engineering.js
import { AppCore } from './core.js';
import { applyRoleRestrictions } from './auth-utils.js';

window.onload = async () => {
    await applyRoleRestrictions();
    // Ito ang magsasabi sa database na "Engineering" data ang kargahin
    AppCore.init('Engineering'); 
};