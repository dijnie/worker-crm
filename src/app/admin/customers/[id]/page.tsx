import { notFound } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CustomerService } from "@/lib/services/customer";

export const dynamic = "force-dynamic";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const customerService = new CustomerService();

  let customer = null;
  try {
    customer = await customerService.getById(id);
  } catch (error) {
    console.error("Error loading customer detail:", error);
  }

  if (!customer) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">{customer.name}</h2>
      </div>

      <div className="rounded-md border p-4 space-y-4 bg-card">
        <h3 className="text-xl font-bold tracking-tight">Customer Details</h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead>Created At</TableHead>
              <TableHead>Updated At</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="font-medium">{customer.name}</TableCell>
              <TableCell>{customer.email}</TableCell>
              <TableCell>{customer.notes || "—"}</TableCell>
              <TableCell>
                {customer.created_at
                  ? new Date(customer.created_at).toLocaleString()
                  : "—"}
              </TableCell>
              <TableCell>
                {customer.updated_at
                  ? new Date(customer.updated_at).toLocaleString()
                  : "—"}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
