import { Suspense } from "react";
import { AuthForm } from "@/components/auth/auth-form";

export default function AuthPage() {
  return (
    <Suspense fallback={<p role="status" className="text-sm text-muted-foreground">Loading…</p>}>
      <AuthForm mode="sign-up" />
    </Suspense>
  );
}
