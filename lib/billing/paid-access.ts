import "server-only";
import { userHasRecruitingAccess } from "./entitlements";
/** Compatibility entry point: status or plan alone never grants access. */
export const userHasPaidAccess = userHasRecruitingAccess;
