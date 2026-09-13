import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppEmptyState } from "@/components/app/app-empty-state";
import { MemberManagement } from "@/components/members/member-management";
import { requireOwner, requireRequestContext } from "@/lib/auth/request-context";
import { ServiceError } from "@/lib/utils/service-error";

export default async function MembersPage() {
  let context;
  try {
    context = await requireRequestContext(await headers());
  } catch (error) {
    if (error instanceof ServiceError && error.status === 401) redirect("/sign-in?returnTo=%2Fsettings%2Fmembers");
    if (error instanceof ServiceError && error.status === 403) redirect("/access-revoked");
    throw error;
  }
  try {
    requireOwner(context);
  } catch (error) {
    if (error instanceof ServiceError && error.status === 403) {
      return <AppEmptyState title="Access denied" description="Only workspace owners can manage members. Contact an owner if you need access." />;
    }
    throw error;
  }
  return <MemberManagement currentUserId={context.user.id} />;
}
