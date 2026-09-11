import { SubscriptionsTable } from "@/components/admin/subscriptions-table";
import { CreateSubscriptionButton } from "@/components/admin/create-subscription";
import {
  SubscriptionService,
  type SubscriptionRecord,
} from "@/lib/services/subscription";
import { getApiToken } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function SubscriptionsPage() {
  const apiToken = getApiToken();
  const subscriptionService = new SubscriptionService();

  let subscriptions: SubscriptionRecord[] = [];
  try {
    subscriptions = await subscriptionService.getAll();
  } catch (error) {
    console.error("Error loading subscriptions:", error);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Subscriptions</h2>
        <CreateSubscriptionButton apiToken={apiToken} />
      </div>

      {subscriptions.length ? (
        <SubscriptionsTable data={subscriptions} />
      ) : (
        <p className="font-medium text-muted-foreground">
          No subscriptions yet. Try creating one using the API or by selecting
          "Create New Subscription" above.
        </p>
      )}
    </div>
  );
}
