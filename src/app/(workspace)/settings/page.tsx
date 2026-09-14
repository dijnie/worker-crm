import Link from "next/link";
import { FieldDefinitionList } from "@/components/app/fields/field-definition-list";
import { PermissionGate } from "@/components/app/permission-gate";
import { Button } from "@/components/ui/button";
export default function SettingsPage() {
  return <PermissionGate system><div className="p-4 md:p-6"><div className="mx-auto flex max-w-7xl flex-col gap-6">
    <h1 className="text-2xl font-medium">Settings</h1>
    <section className="flex flex-wrap items-center justify-between gap-4 rounded-lg border p-6"><div><h2 className="font-medium">Roles and members</h2><p className="mt-2 text-sm text-muted-foreground">Create roles, configure permissions, and assign workspace access.</p></div><div className="flex gap-2"><Button asChild variant="outline"><Link href="/settings/roles">Manage roles</Link></Button><Button asChild variant="outline"><Link href="/settings/members">Manage members</Link></Button></div></section>
    <FieldDefinitionList />
  </div></div></PermissionGate>;
}
