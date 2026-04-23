import { AppCore } from './core.js';
import { applyRoleRestrictions } from './auth-utils.js';

window.onload = async () => {
    await applyRoleRestrictions();
    AppCore.initModule('PCD', 1); // departmentId = 1 for PCD department
};