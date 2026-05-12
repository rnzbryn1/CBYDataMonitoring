import { AppCore } from "./core.js";
import {
  applyRoleRestrictions,
  requireAuth,
  requireDepartmentAccess,
} from "./auth-utils.js";

window.onload = async () => {
  await requireAuth();
  await requireDepartmentAccess(1); // departmentId = 1 for PCD
  await applyRoleRestrictions();
  AppCore.initModule("PCD", 1); // departmentId = 1 for PCD department
};
