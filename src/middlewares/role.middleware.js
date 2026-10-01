import { ApiError } from "../utils/api-error.js";

export const authorizeRoles =
  (...allowedRoles) =>
  (req, _res, next) => {
    if (!req.user) {
      throw new ApiError(401, "Unauthorized request");
    }
    if (!allowedRoles.includes(req.user.role)) {
      throw new ApiError(403, `Access restricted to: ${allowedRoles.join(", ")}`);
    }
    next();
  };

export const restrictedToStudent = authorizeRoles("student");
export const restrictedToFaculty = authorizeRoles("faculty");
export const restrictedToReporter = authorizeRoles("reporter");
export const restrictedToAdmin = authorizeRoles("admin");