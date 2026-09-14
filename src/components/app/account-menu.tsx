"use client";

import { useAppData } from "./app-data-provider";
import UserAvatar from "@carbon/icons-react/es/UserAvatar";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { authClient } from "@/lib/auth/auth-client";
import type { AccountIdentity } from "@/lib/auth/request-context";

export function AccountMenu({ account }: { account: AccountIdentity }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="size-11 md:size-8" aria-label="Account">
          <UserAvatar className="size-4" aria-hidden="true" />
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[calc(100%_-_2rem)] max-w-sm rounded-lg [&>button:last-child]:size-11 [&>button:last-child]:right-1 [&>button:last-child]:top-1 [&>button:last-child]:flex [&>button:last-child]:items-center [&>button:last-child]:justify-center">
        <DialogTitle>Account</DialogTitle>
        <DialogDescription>Your account in the shared workspace.</DialogDescription>
        <dl className="space-y-3 text-sm">
          <div><dt className="text-muted-foreground">Name</dt><dd className="break-words font-medium">{account.name}</dd></div>
          <div><dt className="text-muted-foreground">Email</dt><dd className="break-all">{account.email}</dd></div>
          <div><dt className="text-muted-foreground">Role</dt><dd>{account.role?.name ?? "No role"}</dd></div>
        </dl>
        {account.role?.isSystem && <Button asChild variant="outline" className="min-h-11"><Link href="/settings/members" onClick={() => setOpen(false)}>Manage members</Link></Button>}
        <SignOutButton />
      </DialogContent>
    </Dialog>
  );
}

export function SignOutButton() {
  const { clear, resume } = useAppData();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function signOut() {
    clear();
    setPending(true);
    setError("");
    try {
      const result = await authClient.signOut();
      if (result.error) { resume(); setError("Sign out failed. Please try again."); }
      else window.location.assign("/sign-in");
    } catch {
      resume();
      setError("Sign out failed. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return <div className="space-y-2"><Button variant="outline" className="min-h-11" disabled={pending} onClick={signOut}>{pending ? "Signing out…" : "Sign out"}</Button>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}</div>;
}
