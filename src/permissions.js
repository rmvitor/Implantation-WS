// These flags control the interface only. Every operation is checked again by
// guarded database functions and RLS; never infer roles from an email or JSON.
export const hasProjectRoles = (profile) => profile?.rolesVersion === 1;
export const isMaster = (profile) => !!profile?.active &&
  (hasProjectRoles(profile) ? profile.master === true : profile.admin === true);
export const accountRole = (profile) => isMaster(profile)
  ? hasProjectRoles(profile) ? "Master" : "Administrador"
  : "Colaborador";
export const canCreateProject = (profile) => !!profile?.active &&
  (hasProjectRoles(profile) || isMaster(profile));
export const projectRole = (profile, id) => Array.isArray(profile?.projectRoles) ? profile.projectRoles.find((p) => p.id === id) : null;
export const canManageProject = (profile, id) => isMaster(profile) ||
  !!profile?.active && hasProjectRoles(profile) && typeof profile.id === "string" && !!profile.id && !!id && projectRole(profile, id)?.ownerId === profile.id;
export const canEditProject = (profile, members, id) => canManageProject(profile, id) ||
  !!profile?.active && members.some((p) => p.project_id === id && p.user_id === profile.id && p.role === "editor");
export const projectAccessLabel = (profile, members, id) => isMaster(profile)
  ? accountRole(profile) : canManageProject(profile, id) ? "Gestor do projeto"
    : canEditProject(profile, members, id) ? "Edição" : "Leitura";
