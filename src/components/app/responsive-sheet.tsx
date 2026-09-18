"use client";

import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerHeader,
	DrawerTitle,
} from "@/components/ui/drawer";
import {
	type SheetSize,
	Sheet as UISheet,
	SheetContent as UISheetContent,
	SheetDescription as UISheetDescription,
	SheetHeader as UISheetHeader,
	SheetTitle as UISheetTitle,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils/cn";
import type * as React from "react";
import { createContext, useContext } from "react";

const ResponsiveContext = createContext(false);
const useResponsive = () => useContext(ResponsiveContext);

type DataAttributes = {
	[key in `data-${string}`]: string | number | boolean | undefined;
};

export type SheetContentProps = Omit<
	React.ComponentPropsWithRef<typeof UISheetContent>,
	"children"
> & {
	side?: "top" | "right" | "bottom" | "left";
	size?: SheetSize;
	showCloseButton?: boolean;
} & DataAttributes;

type RootProps = {
	open?: boolean;
	defaultOpen?: boolean;
	onOpenChange?: (open: boolean) => void;
	modal?: boolean;
	children?: React.ReactNode;
};

function Sheet({ children, ...props }: RootProps) {
	const isMobile = useIsMobile();
	return (
		<ResponsiveContext.Provider value={isMobile}>
			{isMobile ? (
				<Drawer {...props}>{children}</Drawer>
			) : (
				<UISheet {...props}>{children}</UISheet>
			)}
		</ResponsiveContext.Provider>
	);
}

function SheetContent({
	children,
	side,
	size,
	showCloseButton,
	className,
	...props
}: SheetContentProps & { children?: React.ReactNode }) {
	if (useResponsive()) {
		return (
			<DrawerContent
				className={cn(
					"data-[vaul-drawer-direction=bottom]:h-[88dvh]",
					className,
				)}
				{...props}
			>
				{children}
			</DrawerContent>
		);
	}
	return (
		<UISheetContent
			side={side}
			size={size}
			showCloseButton={showCloseButton}
			className={className}
			{...props}
		>
			{children}
		</UISheetContent>
	);
}

function SheetHeader(props: React.ComponentProps<"div">) {
	return useResponsive() ? (
		<DrawerHeader {...props} />
	) : (
		<UISheetHeader {...props} />
	);
}

function SheetTitle(props: {
	className?: string;
	size?: "default" | "lg";
	children?: React.ReactNode;
}) {
	return useResponsive() ? (
		<DrawerTitle {...props} />
	) : (
		<UISheetTitle {...props} />
	);
}

function SheetDescription(props: {
	className?: string;
	children?: React.ReactNode;
}) {
	return useResponsive() ? (
		<DrawerDescription {...props} />
	) : (
		<UISheetDescription {...props} />
	);
}

export {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
	type SheetContentProps as ResponsiveSheetContentProps,
};
