// delivery.js
import { AppCore } from './core.js';
import { applyRoleRestrictions, requireAuth } from './auth-utils.js';

window.onload = async () => {
    await requireAuth();
    await applyRoleRestrictions();
    AppCore.initModule('Delivery', 6); // departmentId = 6 for Delivery
};