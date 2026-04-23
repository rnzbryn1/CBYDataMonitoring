import { AppCore } from './core.js';
import { applyRoleRestrictions, requireAuth } from './auth-utils.js';

window.onload = async () => {
    await requireAuth();
    await applyRoleRestrictions();
    AppCore.initModule('PCD', 1); // departmentId = 1 for PCD department
};