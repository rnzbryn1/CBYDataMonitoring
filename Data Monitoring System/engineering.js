// engineering.js
import { AppCore } from "./core.js";
import {
  applyRoleRestrictions,
  requireAuth,
  requireDepartmentAccess,
} from "./auth-utils.js";

window.onload = async () => {
  await requireAuth();
  await requireDepartmentAccess(3); // departmentId = 3 for Engineering
  await applyRoleRestrictions();
  AppCore.initModule("Engineering", 3); // departmentId = 3 for Engineering department
};
