import { Suspense } from "react";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthFormFallback } from "@/components/auth/auth-shell";

export default function AuthPage() {
  return (
    <Suspense fallback={<AuthFormFallback />}>
      <AuthForm mode="reset-password" />
    </Suspense>
  );
}
