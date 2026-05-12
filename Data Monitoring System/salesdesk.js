import { AppCore } from "./core.js";
import {
  applyRoleRestrictions,
  requireAuth,
  requireDepartmentAccess,
} from "./auth-utils.js";

window.onload = async () => {
  await requireAuth();
  await requireDepartmentAccess(2); // departmentId = 2 for Sales Desk
  await applyRoleRestrictions();
  AppCore.initModule("Sales Desk", 2); // departmentId = 2 for Sales Desk
};
