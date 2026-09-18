"use client";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Link as TextLink } from "@/components/ui/link";
import NextLink from "next/link";
import { useSearchParams } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
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

export function AuthForm({ mode }: { mode: AuthMode }) {
  const search = useSearchParams();
  const returnTo = safeReturnUrl(search.get("returnTo"));
  const token = search.get("token");
  const linkError = search.has("error");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [resetComplete, setResetComplete] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);
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
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl/8 font-semibold tracking-tight text-balance">{details.title}</h1>
        <p className="max-w-[32ch] text-sm/5 text-muted-foreground text-pretty">{details.description}</p>
      </div>

      {mode === "sign-in" && linkError && <Alert variant="destructive">The verification link could not be used. Request a new verification email below.</Alert>}
      {mode === "sign-in" && !linkError && search.get("verified") === "true" && <Alert role="status">Your email is verified. Sign in to continue.</Alert>}
      {mode === "verify-email" && linkError && <Alert variant="destructive">This verification link is invalid or expired. Request a new link below.</Alert>}
      {invalidReset && !resetComplete && <Alert variant="destructive">This reset link is missing, invalid, or expired. Request a new link below.</Alert>}
      {notice && <Alert role="status">{notice}</Alert>}

      <form onSubmit={submit} aria-busy={pending} className="flex flex-col gap-4">
        {!invalidReset && !resetComplete && <fieldset disabled={pending}>
          <FieldGroup>
            {mode === "sign-up" && <Field>
              <FieldLabel htmlFor="name">Name</FieldLabel>
              <Input id="name" name="name" autoComplete="name" required maxLength={200} />
            </Field>}
            {showEmail && <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input id="email" name="email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required aria-describedby={error ? "auth-error" : undefined} />
            </Field>}
            {showPassword && <Field>
              <FieldLabel htmlFor="password">{mode === "reset-password" ? "New password" : "Password"}</FieldLabel>
              <Input id="password" name="password" type="password" autoComplete={mode === "sign-in" ? "current-password" : "new-password"} required minLength={mode === "sign-in" ? undefined : 8} maxLength={128} aria-describedby={mode === "sign-in" ? (error ? "auth-error" : undefined) : "password-hint"} />
              {mode !== "sign-in" && <FieldDescription id="password-hint">Use 8 to 128 characters.</FieldDescription>}
            </Field>}
            {mode === "reset-password" && <Field>
              <FieldLabel htmlFor="confirmPassword">Confirm new password</FieldLabel>
              <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required minLength={8} maxLength={128} aria-describedby={error ? "auth-error" : undefined} />
            </Field>}
            <Button type="submit" disabled={pending} className="w-full whitespace-normal">{pending ? "Please wait…" : details.action}</Button>
          </FieldGroup>
        </fieldset>}
        {error && <Alert id="auth-error" ref={errorRef} tabIndex={-1} variant="destructive">{error}</Alert>}
      </form>

      <nav aria-label="Account help" className="flex flex-col items-start border-t pt-4">
        {mode !== "sign-in" && <TextLink asChild variant="inline" className="py-1 text-xs">
          <NextLink href={destination("/sign-in")}>{mode === "access-revoked" ? "Try signing in again" : "Back to sign in"}</NextLink>
        </TextLink>}
        {mode === "sign-in" && <>
          <TextLink asChild variant="inline" className="py-1 text-xs">
            <NextLink href={destination("/sign-up")}>Create an account</NextLink>
          </TextLink>
          <TextLink asChild variant="inline" className="py-1 text-xs">
            <NextLink href={destination("/forgot-password")}>Forgot your password?</NextLink>
          </TextLink>
        </>}
        {["sign-in", "sign-up"].includes(mode) && <TextLink asChild variant="inline" className="py-1 text-xs">
          <NextLink href={destination("/verify-email")}>Resend verification email</NextLink>
        </TextLink>}
        {mode === "reset-password" && !resetComplete && <TextLink asChild variant="inline" className="py-1 text-xs">
          <NextLink href="/forgot-password">Request a new reset link</NextLink>
        </TextLink>}
      </nav>
    </div>
  );
}
