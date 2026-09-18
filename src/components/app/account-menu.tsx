"use client";

import Asleep from "@carbon/icons-react/es/Asleep";
import Light from "@carbon/icons-react/es/Light";
import Logout from "@carbon/icons-react/es/Logout";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { initialsFromName } from "@/lib/ui/format";
import { authClient } from "@/lib/auth/auth-client";
import type { AccountIdentity } from "@/lib/auth/request-context";
import Link from "next/link";
import { useTheme } from "next-themes";
import { useState } from "react";
import { toast } from "sonner";
import { useAppData } from "./app-data-provider";

export function useSignOut() {
  const { clear, resume } = useAppData();
  const [pending, setPending] = useState(false);

  async function signOut() {
    clear();
    setPending(true);
    try {
      const result = await authClient.signOut();
      if (result.error) {
        resume();
        toast.error("Sign out failed. Please try again.");
        return;
      }
      window.location.assign("/sign-in");
    } catch {
      resume();
      toast.error("Sign out failed. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return { pending, signOut };
}

export function SignOutButton() {
  const { pending, signOut } = useSignOut();
  return (
    <Button variant="outline" disabled={pending} onClick={() => void signOut()}>
      {pending ? "Signing out…" : "Sign out"}
    </Button>
  );
}

export function AccountMenu({ account }: { account: AccountIdentity }) {
  const { resolvedTheme, setTheme } = useTheme();
  const { pending, signOut } = useSignOut();
  const isDark = resolvedTheme === "dark";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Account"
          className="hover:bg-transparent aria-expanded:bg-transparent dark:hover:bg-transparent"
        >
          <Avatar className="size-7">
            <AvatarFallback className="text-xs">
              {initialsFromName(account.name)}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="min-w-0 truncate">{account.name}</span>
          <span className="min-w-0 truncate font-normal text-muted-foreground text-xs">
            {account.email}
          </span>
          <span className="min-w-0 truncate font-normal text-muted-foreground text-xs">
            {account.role?.name ?? "No role"}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            setTheme(isDark ? "light" : "dark");
          }}
        >
          {isDark ? <Light /> : <Asleep />}
          {isDark ? "Light mode" : "Dark mode"}
        </DropdownMenuItem>
        {account.role?.isSystem && (
          <DropdownMenuItem asChild>
            <Link href="/settings/members">Manage members</Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={pending} onSelect={() => void signOut()}>
          <Logout />
          {pending ? "Signing out…" : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
