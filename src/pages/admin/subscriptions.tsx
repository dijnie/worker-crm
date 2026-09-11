import type { GetServerSideProps } from "next";
import Layout from "@/layouts/Layout";
import { SubscriptionsTable } from "@/components/admin/subscriptions-table";
import { CreateSubscriptionButton } from "@/components/admin/create-subscription";
import {
  SubscriptionService,
  type SubscriptionRecord,
} from "@/lib/services/subscription";
import { getApiToken, getDB } from "@/lib/services/db";

export interface SubscriptionsPageProps {
  apiToken: string;
  apiTokenSet: boolean;
  subscriptions: SubscriptionRecord[];
}

export const getServerSideProps: GetServerSideProps<SubscriptionsPageProps> = async () => {
  const db = getDB();
  const apiToken = getApiToken();
  const subscriptionService = new SubscriptionService(db);

  let subscriptions: SubscriptionRecord[] = [];
  try {
    subscriptions = await subscriptionService.getAll();
  } catch (error) {
    console.error("Error loading subscriptions:", error);
  }

  return {
    props: {
      apiToken,
      apiTokenSet: Boolean(apiToken && apiToken.trim().length > 0),
      subscriptions,
    },
  };
};

export default function SubscriptionsPage({
  apiToken,
  apiTokenSet,
  subscriptions,
}: SubscriptionsPageProps) {
  return (
    <Layout
      title="Subscriptions"
      apiTokenSet={apiTokenSet}
      actions={<CreateSubscriptionButton apiToken={apiToken} />}
    >
      {subscriptions.length ? (
        <SubscriptionsTable data={subscriptions} />
      ) : (
        <p className="font-medium text-muted-foreground">
          No subscriptions yet. Try creating one using the API or by selecting
          "Create New Subscription" above.
        </p>
      )}
    </Layout>
  );
}
