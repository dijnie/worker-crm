"use client";

import ChevronLeft from "@carbon/icons-react/es/ChevronLeft";
import ChevronRight from "@carbon/icons-react/es/ChevronRight";
import { useDictionary, useFormat } from "@/components/app/i18n-provider";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { ReactNode } from "react";

export function TablePagination({
	page,
	totalPages,
	pageSize,
	total,
	onPageChange,
	loading = false,
	meta,
}: {
	page: number;
	totalPages: number;
	pageSize: number;
	total: number;
	onPageChange: (page: number) => void;
	loading?: boolean;
	meta?: ReactNode;
}) {
	const { ui } = useDictionary();
	const format = useFormat();
	const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
	const rangeEnd = Math.min(page * pageSize, total);

	return (
		<div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
			<span className="flex items-center gap-2 text-muted-foreground text-xs tabular-nums">
				{loading && <Spinner />}
				{meta ??
					(total === 0
						? ui.pagination.noResults
						: ui.pagination.range(
								format.number(rangeStart),
								format.number(rangeEnd),
								format.number(total),
							))}
			</span>
			{totalPages > 1 && (
				<div className="flex items-center gap-2">
					<Button
						variant="ghost"
						size="sm"
						aria-label={ui.pagination.previousPage}
						disabled={page <= 1}
						onClick={() => onPageChange(Math.max(1, page - 1))}
					>
						<ChevronLeft data-icon="inline-start" />
						{ui.pagination.previous}
					</Button>
					<span className="text-muted-foreground text-xs tabular-nums">
						{page} / {totalPages}
					</span>
					<Button
						variant="contrast"
						size="sm"
						aria-label={ui.pagination.nextPage}
						disabled={page >= totalPages}
						onClick={() => onPageChange(page + 1)}
					>
						{ui.pagination.next}
						<ChevronRight data-icon="inline-end" />
					</Button>
				</div>
			)}
		</div>
	);
}
