import type { GetServerSideProps } from "next";
import Layout from "@/layouts/Layout";
import { CustomersTable } from "@/components/admin/customers-table";
import { CreateCustomerButton } from "@/components/admin/create-customer";
import { CustomerService, type CustomerRecord } from "@/lib/services/customer";
import { getApiToken } from "@/lib/db";

export interface CustomersPageProps {
  apiToken: string;
  apiTokenSet: boolean;
  customers: CustomerRecord[];
}

export const getServerSideProps: GetServerSideProps<CustomersPageProps> = async () => {
  const apiToken = getApiToken();
  const customerService = new CustomerService();

  let customers: CustomerRecord[] = [];
  try {
    customers = await customerService.getAll();
  } catch (error) {
    console.error("Error loading customers:", error);
  }

  return {
    props: {
      apiToken,
      apiTokenSet: Boolean(apiToken && apiToken.trim().length > 0),
      customers,
    },
  };
};

export default function CustomersPage({
  apiToken,
  apiTokenSet,
  customers,
}: CustomersPageProps) {
  return (
    <Layout
      title="Customers"
      apiTokenSet={apiTokenSet}
      actions={<CreateCustomerButton apiToken={apiToken} />}
    >
      {customers.length ? (
        <CustomersTable data={customers} />
      ) : (
        <p className="font-medium text-muted-foreground">
          No customers yet. Try creating one using the API or by selecting "Create
          New Customer" above.
        </p>
      )}
    </Layout>
  );
}
