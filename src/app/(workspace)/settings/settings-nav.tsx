"use client";

import { useAppData } from "@/components/app/app-data-provider";
import { matchesNavigationPath } from "@/components/app/navigation-items";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type SettingsNavItem = { label: string; href: string; fragment?: string };

const ROOT = "/settings";

// Custom fields are a section of General rather than a route of their own, so
// they are addressed by fragment. FIELDS_ID is the section's DOM id.
const FIELDS_ID = "custom-field-settings";

const ITEMS: readonly SettingsNavItem[] = [
	{ label: "General", href: ROOT },
	{ label: "Members", href: `${ROOT}/members` },
	{ label: "Roles", href: `${ROOT}/roles` },
	{ label: "Fields", href: `${ROOT}#${FIELDS_ID}`, fragment: `#${FIELDS_ID}` },
];

function isActive(item: SettingsNavItem, pathname: string, fragment: string) {
	if (item.fragment) return pathname === ROOT && fragment === item.fragment;
	if (item.href === ROOT) return pathname === ROOT && fragment === "";
	return matchesNavigationPath(item.href, pathname);
}

function NavLink({
	item,
	active,
	className,
	onSelect,
}: {
	item: SettingsNavItem;
	active: boolean;
	className: string;
	onSelect: () => void;
}) {
	return (
		<Button
			asChild
			variant="ghost"
			className={cn(
				"justify-start font-normal text-muted-foreground",
				active &&
					"bg-muted text-foreground hover:bg-muted hover:text-foreground",
				className,
			)}
		>
			<Link
				href={item.href}
				prefetch
				aria-current={active ? "page" : undefined}
				onClick={onSelect}
				transitionTypes={["nav-lateral"]}
			>
				{item.label}
			</Link>
		</Button>
	);
}

export function SettingsNav() {
	const pathname = usePathname();
	const { account } = useAppData();
	const [fragment, setFragment] = useState("");

	useEffect(() => {
		const sync = () => setFragment(window.location.hash);
		sync();
		window.addEventListener("hashchange", sync);
		return () => window.removeEventListener("hashchange", sync);
	}, [pathname]);

	// Every settings route is system-only, so an account without system access
	// gets no navigation to routes that would refuse it.
	if (!account.role?.isSystem) return null;

	return (
		<>
			<aside className="hidden w-56 shrink-0 border-r md:block [view-transition-name:settings-sidebar]">
				<nav
					aria-label="Workspace settings"
					className="flex flex-col gap-0.5 p-3"
				>
					{ITEMS.map((item) => (
						<NavLink
							key={item.label}
							item={item}
							active={isActive(item, pathname, fragment)}
							className="w-full px-3"
							onSelect={() => setFragment(item.fragment ?? "")}
						/>
					))}
				</nav>
			</aside>

			<nav
				aria-label="Workspace settings"
				className="flex gap-1 overflow-x-auto border-b p-2 md:hidden [view-transition-name:settings-mobile-sidebar]"
			>
				{ITEMS.map((item) => (
					<NavLink
						key={item.label}
						item={item}
						active={isActive(item, pathname, fragment)}
						className="shrink-0 px-3"
						onSelect={() => setFragment(item.fragment ?? "")}
					/>
				))}
			</nav>
		</>
	);
}
