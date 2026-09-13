export type Role='owner'|'admin'|'operator'|'reviewer'|'viewer';
export type Permission='read'|'edit'|'approve'|'release'|'manage'|'recover';
export const permissions:Record<Role,Permission[]>={owner:['read','edit','approve','release','manage','recover'],admin:['read','edit','approve','release','manage','recover'],operator:['read','edit','release'],reviewer:['read','approve'],viewer:['read']};
export function can(role:Role,permission:Permission){return permissions[role]?.includes(permission)||false;}
