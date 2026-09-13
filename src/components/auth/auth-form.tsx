"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth/auth-client";
import { safeReturnUrl } from "@/lib/auth/safe-return-url";

type AuthMode = "sign-in" | "sign-up" | "verify-email" | "forgot-password" | "reset-password" | "access-revoked";
const content: Record<AuthMode, { title: string; description: string; action: string }> = {
  "sign-in": { title: "Sign in", description: "Use your verified email to open the shared workspace.", action: "Sign in" },
  "sign-up": { title: "Create an account", description: "Verify your email to join the shared Vinext workspace.", action: "Create account" },
  "verify-email": { title: "Verify your email", description: "Open the verification link in your email, then sign in. Need a new link? Enter your email below.", action: "Resend verification email" },
  "forgot-password": { title: "Forgot your password?", description: "Enter your email to request a password reset link.", action: "Send reset link" },
  "reset-password": { title: "Reset your password", description: "Choose a new password. You will need to sign in again on all devices.", action: "Reset password" },
  "access-revoked": { title: "Workspace access revoked", description: "Contact a workspace owner to restore your access. Once restored, sign in again to continue.", action: "Sign out" },
};
const linkClass = "inline-flex min-h-11 items-center rounded-sm text-sm text-link underline-offset-4 hover:text-link-hover hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function AuthForm({ mode }: { mode: AuthMode }) {
  const search = useSearchParams();
  const returnTo = safeReturnUrl(search.get("returnTo"));
  const token = search.get("token");
  const linkError = search.has("error");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [resetComplete, setResetComplete] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const details = content[mode];
  const destination = (path: string) => returnTo === "/" ? path : `${path}?returnTo=${encodeURIComponent(returnTo)}`;
  const verificationCallback = `/sign-in?verified=true${returnTo === "/" ? "" : `&returnTo=${encodeURIComponent(returnTo)}`}`;
  const invalidReset = mode === "reset-password" && (!token || linkError);
  const showEmail = ["sign-in", "sign-up", "verify-email", "forgot-password"].includes(mode);
  const showPassword = ["sign-in", "sign-up", "reset-password"].includes(mode);

  function reportError(message: string) {
    setError(message);
    requestAnimationFrame(() => errorRef.current?.focus());
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const email = String(fields.get("email") ?? "").trim().toLowerCase();
    const password = String(fields.get("password") ?? "");
    setError("");
    setNotice("");
    if (mode === "reset-password" && password !== String(fields.get("confirmPassword") ?? "")) {
      reportError("The passwords do not match. Enter the same password in both fields.");
      return;
    }
    if (mode === "sign-up" && !String(fields.get("name") ?? "").trim()) {
      reportError("Enter your name to create an account.");
      return;
    }
    setPending(true);
    try {
      if (mode === "sign-in") {
        const result = await authClient.signIn.email({ email, password });
        if (result.error) {
          if (String(result.error.code) === "ACCESS_REVOKED") {
            window.location.assign("/access-revoked");
            return;
          }
          reportError(result.error.status === 429 ? "Too many attempts. Wait a minute and try again." : "Unable to sign in. Check your email and password, and make sure your email is verified.");
        } else {
          window.location.assign(returnTo);
        }
      } else if (mode === "sign-up") {
        const result = await authClient.signUp.email({ name: String(fields.get("name")).trim(), email, password, callbackURL: verificationCallback });
        if (result.error) reportError("We could not complete signup. Try again, or resend a verification email if you already submitted this form.");
        else window.location.assign(destination("/verify-email"));
      } else if (mode === "verify-email") {
        const result = await authClient.sendVerificationEmail({ email, callbackURL: verificationCallback });
        if (result.error) reportError("We could not send the verification email. Wait a minute and try again.");
        else setNotice("If this account needs verification, a new link has been sent. Check your inbox and spam folder.");
      } else if (mode === "forgot-password") {
        const result = await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
        if (result.error) reportError("We could not process this request. Wait a minute and try again.");
        else setNotice("If an account matches this email, a reset link has been sent. Check your inbox and spam folder.");
      } else if (mode === "reset-password" && token && !linkError) {
        const result = await authClient.resetPassword({ newPassword: password, token });
        if (result.error) reportError(result.error.status === 429 ? "Too many attempts. Wait a minute and try again." : "This reset link could not be used. It may have expired or already been used. Request a new link below.");
        else {
          form.reset();
          setResetComplete(true);
          window.history.replaceState(null, "", "/reset-password");
          setNotice("Your password has been reset. Sign in with your new password.");
        }
      } else if (mode === "access-revoked") {
        const result = await authClient.signOut();
        if (result.error) reportError("We could not sign you out. Check your connection and try again.");
        else window.location.assign("/sign-in");
      }
    } catch {
      reportError("The request could not be completed. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-balance text-2xl font-medium tracking-tight">{details.title}</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">{details.description}</p>
      </div>
      {mode === "sign-in" && linkError && <p role="alert" className="text-sm text-destructive">The verification link could not be used. Request a new verification email below.</p>}
      {mode === "sign-in" && !linkError && search.get("verified") === "true" && <p role="status" className="text-sm">Your email is verified. Sign in to continue.</p>}
      {mode === "verify-email" && linkError && <p role="alert" className="text-sm text-destructive">This verification link is invalid or expired. Request a new link below.</p>}
      {invalidReset && !resetComplete && <p role="alert" className="text-sm text-destructive">This reset link is missing, invalid, or expired. Request a new link below.</p>}
      {notice && <p role="status" className="rounded-md border bg-muted p-3 text-sm leading-relaxed">{notice}</p>}
      <form onSubmit={submit} aria-busy={pending} className="space-y-4">
        {!invalidReset && !resetComplete && <fieldset disabled={pending} className="space-y-4">
          {mode === "sign-up" && <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" autoComplete="name" required maxLength={200} className="h-11" />
          </div>}
          {showEmail && <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required className="h-11" aria-describedby={error ? "auth-error" : undefined} />
          </div>}
          {showPassword && <div className="space-y-2">
            <Label htmlFor="password">{mode === "reset-password" ? "New password" : "Password"}</Label>
            <Input id="password" name="password" type="password" autoComplete={mode === "sign-in" ? "current-password" : "new-password"} required minLength={mode === "sign-in" ? undefined : 8} maxLength={128} className="h-11" aria-describedby={mode === "sign-in" ? (error ? "auth-error" : undefined) : "password-hint"} />
            {mode !== "sign-in" && <p id="password-hint" className="text-xs text-muted-foreground">Use 8 to 128 characters.</p>}
          </div>}
          {mode === "reset-password" && <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm new password</Label>
            <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required minLength={8} maxLength={128} className="h-11" aria-describedby={error ? "auth-error" : undefined} />
          </div>}
          <Button type="submit" disabled={pending} className="min-h-11 w-full whitespace-normal">{pending ? "Please wait…" : details.action}</Button>
        </fieldset>}
        {error && <p id="auth-error" ref={errorRef} role="alert" tabIndex={-1} className="rounded-sm text-sm leading-relaxed text-destructive focus:outline-none focus:ring-2 focus:ring-ring">{error}</p>}
      </form>
      <nav aria-label="Account help" className="flex flex-col items-start border-t pt-3">
        {mode !== "sign-in" && <Link href={destination("/sign-in")} className={linkClass}>{mode === "access-revoked" ? "Try signing in again" : "Back to sign in"}</Link>}
        {mode === "sign-in" && <>
          <Link href={destination("/sign-up")} className={linkClass}>Create an account</Link>
          <Link href={destination("/forgot-password")} className={linkClass}>Forgot your password?</Link>
        </>}
        {["sign-in", "sign-up"].includes(mode) && <Link href={destination("/verify-email")} className={linkClass}>Resend verification email</Link>}
        {mode === "reset-password" && !resetComplete && <Link href="/forgot-password" className={linkClass}>Request a new reset link</Link>}
      </nav>
    </div>
  );
}
