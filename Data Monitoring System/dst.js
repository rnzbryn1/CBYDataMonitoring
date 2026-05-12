// dst.js
import { AppCore } from "./core.js";
import {
  applyRoleRestrictions,
  requireAuth,
  requireDepartmentAccess,
} from "./auth-utils.js";

window.onload = async () => {
  await requireAuth();
  await requireDepartmentAccess(5); // departmentId = 5 for DST
  await applyRoleRestrictions();
  AppCore.initModule("DST", 5); // departmentId = 5 for DST
};
