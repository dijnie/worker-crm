export const permissionCatalog = {
  company: ["read", "create", "update", "archive", "restore"],
  contact: ["read", "create", "update", "archive", "restore"],
  deal: ["read", "create", "update", "archive", "restore"],
  activity: ["read", "create", "complete", "delete"],
} as const;

export type PermissionEntity = keyof typeof permissionCatalog;
export type PermissionAction = typeof permissionCatalog[PermissionEntity][number];
export type Permission = { [E in PermissionEntity]: { entity: E; action: typeof permissionCatalog[E][number] } }[PermissionEntity];
export interface PermissionAccess {
  role: { isSystem: boolean } | null;
  permissions: readonly Permission[];
}
export const allPermissions: Permission[] = Object.entries(permissionCatalog).flatMap(([entity, actions]) =>
  actions.map(action => ({ entity, action }) as Permission));

export function canPermission(access: PermissionAccess | null | undefined, entity: PermissionEntity, action: PermissionAction): boolean {
  if (!access?.role) return false;
  if (!(permissionCatalog[entity] as readonly string[]).includes(action)) return false;
  if (access.role.isSystem) return true;
  return access.permissions.some(permission => permission.entity === entity && permission.action === "read") &&
    access.permissions.some(permission => permission.entity === entity && permission.action === action);
}
