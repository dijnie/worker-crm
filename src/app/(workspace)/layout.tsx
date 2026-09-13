import { AppShell } from "@/components/app/app-shell";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireRequestContext } from "@/lib/auth/request-context";
import { ServiceError } from "@/lib/utils/service-error";

export default async function WorkspaceLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  let context;
  try {
    context = await requireRequestContext(await headers());
  } catch (error) {
    if (error instanceof ServiceError && error.status === 401) redirect("/sign-in");
    if (error instanceof ServiceError && error.status === 403) redirect("/access-revoked");
    throw error;
  }
  const account = { id: context.user.id, name: context.user.name, email: context.user.email, role: context.membership.role };
  return <AppShell account={account}>{children}</AppShell>;
}
