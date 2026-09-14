import { PermissionGate } from "@/components/app/permission-gate";
import { RoleManagement } from "@/components/roles/role-management";
export default function RolesPage() { return <PermissionGate system><RoleManagement /></PermissionGate>; }
