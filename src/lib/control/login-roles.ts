// The roles a founder can give a login from Control (C230-D). No module import here, so the screen can use it too.
// A parent's login is tied to one guardian record of the school, and opens the family app only.
export const LOGIN_ROLES = ['principal', 'school_admin', 'teacher', 'accountant', 'academic_coordinator', 'parent'] as const;
export type LoginRole = (typeof LOGIN_ROLES)[number];
