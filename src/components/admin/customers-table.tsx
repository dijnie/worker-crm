"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import {
  createColumnHelper,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { DataTable } from "@/components/admin/data-table";
import type { CustomerRecord } from "@/lib/services/customer";

export type Customer = CustomerRecord;

const columnHelper = createColumnHelper<Customer>();
const columns: ColumnDef<Customer, unknown>[] = [
  columnHelper.accessor("id", {
    header: "ID",
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor("name", {
    header: "Name",
    cell: (info) => {
      return (
        <Link
          className="text-primary underline font-medium hover:opacity-80"
          href={`/admin/customers/${info.row.original.id}`}
        >
          {info.getValue()}
        </Link>
      );
    },
  }),
  columnHelper.accessor("email", {
    header: "Email",
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor("notes", {
    header: "Notes",
    cell: (info) => info.getValue() || "—",
  }),
  columnHelper.accessor((row) => row.subscription?.status, {
    id: "subscription_status",
    header: "Subscription",
    cell: (info) => {
      const status = info.getValue();
      return status ? (
        <span className="capitalize font-medium text-emerald-600 dark:text-emerald-400">
          {status}
        </span>
      ) : (
        <span className="text-muted-foreground">None</span>
      );
    },
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

interface CustomersTableProps {
  data: Customer[];
}

export function CustomersTable({ data }: CustomersTableProps) {
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
