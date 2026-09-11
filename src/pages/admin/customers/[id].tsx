import type { GetServerSideProps } from "next";
import Layout from "@/layouts/Layout";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CustomerService, type CustomerRecord } from "@/lib/services/customer";
import { getDB } from "@/lib/services/db";

export interface CustomerDetailPageProps {
  customer: CustomerRecord;
}

export const getServerSideProps: GetServerSideProps<CustomerDetailPageProps> = async ({
  params,
}) => {
  const id = params?.id as string;
  const db = getDB();
  const customerService = new CustomerService(db);

  let customer = null;
  try {
    customer = await customerService.getById(id);
  } catch (error) {
    console.error("Error loading customer detail:", error);
  }

  if (!customer) {
    return { notFound: true };
  }

  return {
    props: {
      customer,
    },
  };
};

export default function CustomerDetailPage({
  customer,
}: CustomerDetailPageProps) {
  return (
    <Layout title={customer.name}>
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
    </Layout>
  );
}
