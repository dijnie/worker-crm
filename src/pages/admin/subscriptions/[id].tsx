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
import {
  SubscriptionService,
  type SubscriptionRecord,
} from "@/lib/services/subscription";

export interface SubscriptionDetailPageProps {
  subscription: SubscriptionRecord;
}

export const getServerSideProps: GetServerSideProps<SubscriptionDetailPageProps> = async ({
  params,
}) => {
  const id = params?.id as string;
  const subscriptionService = new SubscriptionService();

  let subscription = null;
  try {
    subscription = await subscriptionService.getById(id);
  } catch (error) {
    console.error("Error loading subscription detail:", error);
  }

  if (!subscription) {
    return { notFound: true };
  }

  return {
    props: {
      subscription,
    },
  };
};

export default function SubscriptionDetailPage({
  subscription,
}: SubscriptionDetailPageProps) {
  return (
    <Layout title={subscription.name}>
      <div className="flex flex-col gap-8">
        <div className="rounded-md border p-4 space-y-4 bg-card">
          <h3 className="text-xl font-bold tracking-tight">
            Subscription Details
          </h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Created At</TableHead>
                <TableHead>Updated At</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium">
                  {subscription.name}
                </TableCell>
                <TableCell>{subscription.description}</TableCell>
                <TableCell>${Number(subscription.price).toFixed(2)}</TableCell>
                <TableCell>
                  {subscription.created_at
                    ? new Date(subscription.created_at).toLocaleString()
                    : "—"}
                </TableCell>
                <TableCell>
                  {subscription.updated_at
                    ? new Date(subscription.updated_at).toLocaleString()
                    : "—"}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>

        <div className="rounded-md border p-4 space-y-4 bg-card">
          <h3 className="text-xl font-bold tracking-tight">Features</h3>

          {!subscription.features || subscription.features.length === 0 ? (
            <p className="font-medium text-muted-foreground">
              No features added for this subscription.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Description</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subscription.features.map((feature, index) => (
                  <TableRow key={feature.id ?? index}>
                    <TableCell className="font-medium">
                      {feature.name}
                    </TableCell>
                    <TableCell>{feature.description || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </Layout>
  );
}
