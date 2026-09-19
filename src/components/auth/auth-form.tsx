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
import { useDictionary } from "@/components/app/i18n-provider";
import type { AuthMode } from "@/lib/i18n/dictionaries/auth";

export function AuthForm({ mode }: { mode: AuthMode }) {
  const { auth: copy } = useDictionary();
  const search = useSearchParams();
  const returnTo = safeReturnUrl(search.get("returnTo"));
  const token = search.get("token");
  const linkError = search.has("error");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [resetComplete, setResetComplete] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const details = copy.modes[mode];
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
      reportError(copy.errors.passwordMismatch);
      return;
    }
    if (mode === "sign-up" && !String(fields.get("name") ?? "").trim()) {
      reportError(copy.errors.nameRequired);
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
          reportError(result.error.status === 429 ? copy.errors.tooManyAttempts : copy.errors.signInFailed);
        } else {
          window.location.assign(returnTo);
        }
      } else if (mode === "sign-up") {
        const result = await authClient.signUp.email({ name: String(fields.get("name")).trim(), email, password, callbackURL: verificationCallback });
        if (result.error) reportError(copy.errors.signUpFailed);
        else window.location.assign(destination("/verify-email"));
      } else if (mode === "verify-email") {
        const result = await authClient.sendVerificationEmail({ email, callbackURL: verificationCallback });
        if (result.error) reportError(copy.errors.verificationSendFailed);
        else setNotice(copy.notices.verificationResent);
      } else if (mode === "forgot-password") {
        const result = await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
        if (result.error) reportError(copy.errors.passwordResetRequestFailed);
        else setNotice(copy.notices.resetLinkSent);
      } else if (mode === "reset-password" && token && !linkError) {
        const result = await authClient.resetPassword({ newPassword: password, token });
        if (result.error) reportError(result.error.status === 429 ? copy.errors.tooManyAttempts : copy.errors.resetFailed);
        else {
          form.reset();
          setResetComplete(true);
          window.history.replaceState(null, "", "/reset-password");
          setNotice(copy.notices.passwordResetDone);
        }
      } else if (mode === "access-revoked") {
        const result = await authClient.signOut();
        if (result.error) reportError(copy.errors.signOutFailed);
        else window.location.assign("/sign-in");
      }
    } catch {
      reportError(copy.errors.requestFailed);
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

      {mode === "sign-in" && linkError && <Alert variant="destructive">{copy.alerts.verificationLinkUnusable}</Alert>}
      {mode === "sign-in" && !linkError && search.get("verified") === "true" && <Alert role="status">{copy.alerts.emailVerified}</Alert>}
      {mode === "verify-email" && linkError && <Alert variant="destructive">{copy.alerts.verifyLinkInvalid}</Alert>}
      {invalidReset && !resetComplete && <Alert variant="destructive">{copy.alerts.resetLinkProblem}</Alert>}
      {notice && <Alert role="status">{notice}</Alert>}

      <form onSubmit={submit} aria-busy={pending} className="flex flex-col gap-4">
        {!invalidReset && !resetComplete && <fieldset disabled={pending}>
          <FieldGroup>
            {mode === "sign-up" && <Field>
              <FieldLabel htmlFor="name">{copy.fields.name}</FieldLabel>
              <Input id="name" name="name" autoComplete="name" required maxLength={200} />
            </Field>}
            {showEmail && <Field>
              <FieldLabel htmlFor="email">{copy.fields.email}</FieldLabel>
              <Input id="email" name="email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required aria-describedby={error ? "auth-error" : undefined} />
            </Field>}
            {showPassword && <Field>
              <FieldLabel htmlFor="password">{mode === "reset-password" ? copy.fields.newPassword : copy.fields.password}</FieldLabel>
              <Input id="password" name="password" type="password" autoComplete={mode === "sign-in" ? "current-password" : "new-password"} required minLength={mode === "sign-in" ? undefined : 8} maxLength={128} aria-describedby={mode === "sign-in" ? (error ? "auth-error" : undefined) : "password-hint"} />
              {mode !== "sign-in" && <FieldDescription id="password-hint">{copy.fields.passwordHint}</FieldDescription>}
            </Field>}
            {mode === "reset-password" && <Field>
              <FieldLabel htmlFor="confirmPassword">{copy.fields.confirmPassword}</FieldLabel>
              <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required minLength={8} maxLength={128} aria-describedby={error ? "auth-error" : undefined} />
            </Field>}
            <Button type="submit" disabled={pending} className="w-full whitespace-normal">{pending ? copy.pending : details.action}</Button>
          </FieldGroup>
        </fieldset>}
        {error && <Alert id="auth-error" ref={errorRef} tabIndex={-1} variant="destructive">{error}</Alert>}
      </form>

      <nav aria-label={copy.nav.label} className="flex flex-col items-start border-t pt-4">
        {mode !== "sign-in" && <TextLink asChild variant="inline" className="py-1 text-xs">
          <NextLink href={destination("/sign-in")}>{mode === "access-revoked" ? copy.nav.tryAgain : copy.nav.backToSignIn}</NextLink>
        </TextLink>}
        {mode === "sign-in" && <>
          <TextLink asChild variant="inline" className="py-1 text-xs">
            <NextLink href={destination("/sign-up")}>{copy.nav.createAccount}</NextLink>
          </TextLink>
          <TextLink asChild variant="inline" className="py-1 text-xs">
            <NextLink href={destination("/forgot-password")}>{copy.nav.forgotPassword}</NextLink>
          </TextLink>
        </>}
        {["sign-in", "sign-up"].includes(mode) && <TextLink asChild variant="inline" className="py-1 text-xs">
          <NextLink href={destination("/verify-email")}>{copy.nav.resendVerification}</NextLink>
        </TextLink>}
        {mode === "reset-password" && !resetComplete && <TextLink asChild variant="inline" className="py-1 text-xs">
          <NextLink href="/forgot-password">{copy.nav.requestNewResetLink}</NextLink>
        </TextLink>}
      </nav>
    </div>
  );
}
