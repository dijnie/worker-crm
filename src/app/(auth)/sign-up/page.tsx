import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { AuthForm } from "@/components/auth/auth-form";

export default function AuthPage() {
  return (
    <Suspense fallback={<div role="status" aria-busy="true" className="space-y-3"><Skeleton className="h-8 w-48" /><Skeleton className="h-4 w-full" /><Skeleton className="h-11 w-full" /></div>}>
      <AuthForm mode="sign-up" />
    </Suspense>
  );
}
