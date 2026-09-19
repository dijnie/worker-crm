"use client";

import type { ReactNode } from "react";
import { useAppData } from "./app-data-provider";
import { canPermission, type Permission } from "@/lib/auth/permissions";
import { SignOutButton } from "./account-menu";
import { useDictionary } from "./i18n-provider";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";

export function PermissionGate({
  entity,
  action = "read",
  system = false,
  children,
}: {
  entity?: Permission["entity"];
  action?: Permission["action"];
  system?: boolean;
  children: ReactNode;
}) {
  const { account } = useAppData();
  const { shell: copy } = useDictionary();
  const allowed = system ? account.role?.isSystem : entity && canPermission(account, entity, action);
  if (allowed) return children;
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-balance font-medium text-2xl tracking-tight md:text-3xl">
        {copy.permissionGate.accessDeniedTitle}
      </h1>
      <Empty>
        <EmptyHeader>
          <EmptyTitle>{copy.permissionGate.forbiddenTitle}</EmptyTitle>
          <EmptyDescription>
            {copy.permissionGate.forbiddenDescription}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  );
}

export function PendingAccess() {
  const { refreshAccount } = useAppData();
  const { shell: copy } = useDictionary();
  return (
    <main className="flex min-h-svh flex-col items-center justify-center px-6">
      <div className="flex w-full max-w-md flex-col items-center gap-3 text-center">
        <h1 className="text-balance font-medium text-2xl tracking-tight">
          {copy.permissionGate.pendingTitle}
        </h1>
        <p className="text-balance text-muted-foreground text-sm">
          {copy.permissionGate.pendingDescription}
        </p>
        <div className="mt-3 flex items-center gap-2">
          <Button variant="outline" onClick={() => void refreshAccount()}>
            {copy.permissionGate.checkAccess}
          </Button>
          <SignOutButton />
        </div>
      </div>
    </main>
  );
}
