"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import {
  createColumnHelper,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { DataTable } from "@/components/admin/data-table";
import type { SubscriptionRecord } from "@/lib/services/subscription";

export type Subscription = SubscriptionRecord;

const columnHelper = createColumnHelper<Subscription>();

const columns: ColumnDef<Subscription, unknown>[] = [
  columnHelper.accessor("id", {
    header: "ID",
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor("name", {
    header: "Name",
    cell: (info) => (
      <Link
        className="text-primary underline font-medium hover:opacity-80"
        href={`/admin/subscriptions/${info.row.original.id}`}
      >
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("description", {
    header: "Description",
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor("price", {
    header: "Price",
    cell: (info) => `$${Number(info.getValue()).toFixed(2)}`,
  }),
  columnHelper.accessor("created_at", {
    header: "Created At",
    cell: (info) =>
      info.getValue() ? new Date(info.getValue()).toLocaleDateString() : "—",
  }),
  columnHelper.accessor("updated_at", {
    header: "Updated At",
    cell: (info) =>
      info.getValue() ? new Date(info.getValue()).toLocaleDateString() : "—",
  }),
];

interface SubscriptionsTableProps {
  data: Subscription[];
}

export function SubscriptionsTable({ data }: SubscriptionsTableProps) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="rounded-md border">
      <DataTable table={table} />
    </div>
  );
}
