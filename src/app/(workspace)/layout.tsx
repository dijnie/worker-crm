import { AppShell } from "@/components/app/app-shell";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireRequestContext } from "@/lib/auth/request-context";
import { ServiceError } from "@/lib/utils/service-error";
import { AUTH_RETURN_TO_HEADER, signInUrl } from "@/lib/auth/safe-return-url";

export default async function WorkspaceLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  let context;
  const requestHeaders = await headers();
  try {
    context = await requireRequestContext(requestHeaders);
  } catch (error) {
    if (error instanceof ServiceError && error.status === 401) redirect(signInUrl(requestHeaders.get(AUTH_RETURN_TO_HEADER)));
    if (error instanceof ServiceError && error.status === 403) redirect("/access-revoked");
    throw error;
  }
  const account = { id: context.user.id, name: context.user.name, email: context.user.email, role: context.membership.role };
  return <AppShell account={account}>{children}</AppShell>;
}
