import { Suspense } from "react";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthFormFallback } from "@/components/auth/auth-shell";
import { getWorkspaceDictionary } from "@/lib/i18n/workspace-locale";

export default async function AuthPage() {
  const { auth: copy } = await getWorkspaceDictionary();
  return (
    <Suspense fallback={<AuthFormFallback loadingLabel={copy.loadingForm} />}>
      <AuthForm mode="verify-email" />
    </Suspense>
  );
}
