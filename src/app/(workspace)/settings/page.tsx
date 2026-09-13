import Link from "next/link";
import { FieldDefinitionList } from "@/components/app/fields/field-definition-list";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { requireRequestContext } from "@/lib/auth/request-context";
import { ServiceError } from "@/lib/utils/service-error";

export default async function SettingsPage() {
  let context;
  try {
    context = await requireRequestContext(await headers());
  } catch (error) {
    if (error instanceof ServiceError && error.status === 401) redirect("/sign-in?returnTo=%2Fsettings");
    if (error instanceof ServiceError && error.status === 403) redirect("/access-revoked");
    throw error;
  }
  return (
    <div className="p-4 md:p-6">
      <div className="mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-6">
        <h1 className="text-2xl font-medium tracking-tight md:text-3xl">Settings</h1>
        <section className="rounded-lg border bg-card p-6 text-card-foreground">
          {context.membership.role === "owner" ? <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-2"><h2 className="font-medium">Members</h2><p className="text-sm text-muted-foreground">Manage workspace roles and access.</p></div>
            <Button asChild variant="outline" className="min-h-11"><Link href="/settings/members">Manage members</Link></Button>
          </div> : <p className="text-sm text-muted-foreground">Workspace owners manage member access. Open Account to view your role or sign out.</p>}
        </section>
        <FieldDefinitionList />
      </div>
    </div>
  );
}
