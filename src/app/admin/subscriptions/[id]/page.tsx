import { notFound } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SubscriptionService } from "@/lib/services/subscription";

export const dynamic = "force-dynamic";

export default async function SubscriptionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const subscriptionService = new SubscriptionService();

  let subscription = null;
  try {
    subscription = await subscriptionService.getById(id);
  } catch (error) {
    console.error("Error loading subscription detail:", error);
  }

  if (!subscription) {
    notFound();
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">
          {subscription.name}
        </h2>
      </div>

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
    </div>
  );
}
