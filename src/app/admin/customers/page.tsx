import { CustomersTable } from "@/components/admin/customers-table";
import { CreateCustomerButton } from "@/components/admin/create-customer";
import { CustomerService, type CustomerRecord } from "@/lib/services/customer";
import { getApiToken } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const apiToken = getApiToken();
  const customerService = new CustomerService();

  let customers: CustomerRecord[] = [];
  try {
    customers = await customerService.getAll();
  } catch (error) {
    console.error("Error loading customers:", error);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Customers</h2>
        <CreateCustomerButton apiToken={apiToken} />
      </div>

      {customers.length ? (
        <CustomersTable data={customers} />
      ) : (
        <p className="font-medium text-muted-foreground">
          No customers yet. Try creating one using the API or by selecting "Create
          New Customer" above.
        </p>
      )}
    </div>
  );
}
