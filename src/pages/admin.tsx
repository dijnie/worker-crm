import type { GetServerSideProps } from "next";
import Link from "next/link";
import { BadgeDollarSign, CalendarSync, User } from "lucide-react";
import Layout from "@/layouts/Layout";
import { APIDocumentation } from "@/components/admin/api-documentation";
import { CustomerService } from "@/lib/services/customer";
import { SubscriptionService } from "@/lib/services/subscription";
import { CustomerSubscriptionService } from "@/lib/services/customer_subscription";
import { getApiToken } from "@/lib/db";

export interface AdminPageProps {
  apiTokenSet: boolean;
  customersCount: number;
  subscriptionsCount: number;
  customerSubscriptionsCount: number;
}

export const getServerSideProps: GetServerSideProps<AdminPageProps> = async () => {
  const apiToken = getApiToken();
  const customerService = new CustomerService();
  const subscriptionService = new SubscriptionService();
  const customerSubscriptionService = new CustomerSubscriptionService();

  let customersCount = 0;
  let subscriptionsCount = 0;
  let customerSubscriptionsCount = 0;

  try {
    const [customers, subscriptions, customerSubscriptions] = await Promise.all([
      customerService.getAll(),
      subscriptionService.getAll(),
      customerSubscriptionService.getAll(),
    ]);
    customersCount = customers.length;
    subscriptionsCount = subscriptions.length;
    customerSubscriptionsCount = customerSubscriptions.length;
  } catch (error) {
    console.error("Error loading admin stats:", error);
  }

  return {
    props: {
      apiTokenSet: Boolean(apiToken && apiToken.trim().length > 0),
      customersCount,
      subscriptionsCount,
      customerSubscriptionsCount,
    },
  };
};

export default function AdminPage({
  apiTokenSet,
  customersCount,
  subscriptionsCount,
  customerSubscriptionsCount,
}: AdminPageProps) {
  const data = [
    {
      name: "Customers",
      value: customersCount,
      icon: User,
      href: "/admin/customers",
    },
    {
      name: "Subscriptions",
      value: subscriptionsCount,
      icon: BadgeDollarSign,
      href: "/admin/subscriptions",
    },
    {
      name: "Customer Subscriptions",
      value: customerSubscriptionsCount,
      icon: CalendarSync,
    },
  ];

  return (
    <Layout title="Admin" apiTokenSet={apiTokenSet}>
      <div className="space-y-8">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mt-4">
          {data.map((item) => {
            const Icon = item.icon;
            return item.href ? (
              <div
                key={item.name}
                className="rounded-xl border bg-card text-card-foreground hover:bg-muted/50 shadow transition-colors"
              >
                <Link href={item.href} className="block p-6">
                  <div className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <span className="tracking-tight text-sm font-medium">
                      {item.name}
                    </span>
                    <Icon className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="pt-0">
                    <div className="text-2xl font-bold">{item.value}</div>
                  </div>
                </Link>
              </div>
            ) : (
              <div
                key={item.name}
                className="rounded-xl border bg-card text-card-foreground shadow p-6"
              >
                <div className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <span className="tracking-tight text-sm font-medium">
                    {item.name}
                  </span>
                  <Icon className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="pt-0">
                  <div className="text-2xl font-bold">{item.value}</div>
                </div>
              </div>
            );
          })}
        </div>

        <section className="space-y-4">
          <h2 className="text-3xl font-bold tracking-tight">API</h2>
          <div>
            <APIDocumentation />
          </div>
        </section>
      </div>
    </Layout>
  );
}
