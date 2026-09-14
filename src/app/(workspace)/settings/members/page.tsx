"use client";
import { MemberManagement } from "@/components/members/member-management";
import { PermissionGate } from "@/components/app/permission-gate";
import { useAppData } from "@/components/app/app-data-provider";
export default function MembersPage() {
  const { account } = useAppData();
  return <PermissionGate system><MemberManagement currentUserId={account.id} /></PermissionGate>;
}
