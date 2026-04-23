import { AppCore } from './core.js';
import { applyRoleRestrictions, requireAuth } from './auth-utils.js';

window.onload = async () => {
    await requireAuth();
    await applyRoleRestrictions();
    AppCore.initModule('Sales Desk', 2); // departmentId = 2 for Sales Desk
};