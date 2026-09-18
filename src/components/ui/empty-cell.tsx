import { cn } from "@/lib/utils/cn";

export function EmptyCellValue({ className }: { className?: string }) {
	return <span className={cn("text-muted-foreground", className)}>—</span>;
}
