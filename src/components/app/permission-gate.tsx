"use client";
import type { ReactNode } from "react";
import { useAppData } from "./app-data-provider";
import { canPermission, type Permission } from "@/lib/auth/permissions";
import { SignOutButton } from "./account-menu";
import { Button } from "@/components/ui/button";
export function PermissionGate({ entity, action = "read", system = false, children }: { entity?: Permission["entity"]; action?: Permission["action"]; system?: boolean; children: ReactNode }) {
  const { account } = useAppData();
  const allowed = system ? account.role?.isSystem : entity && canPermission(account, entity, action);
  return allowed ? children : <div className="space-y-2 p-6"><h1 className="text-xl font-semibold">Access denied</h1><p className="text-sm text-muted-foreground">Your role does not allow access to this page. Contact a system account to request access.</p></div>;
}
export function PendingAccess() {
  const { refreshAccount } = useAppData();
  return <main className="mx-auto flex min-h-svh max-w-lg flex-col justify-center gap-4 p-6"><h1 className="text-2xl font-semibold">Waiting for access</h1><p className="text-muted-foreground">Your account is signed in. A system account must assign a role with permissions before you can use the workspace.</p><div className="flex items-center gap-3"><Button variant="outline" onClick={() => void refreshAccount()}>Check access</Button><SignOutButton /></div></main>;
}
