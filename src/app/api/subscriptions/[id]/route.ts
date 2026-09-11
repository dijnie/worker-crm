import { validateApiTokenResponse } from "@/lib/api";
import { SubscriptionService } from "@/lib/services/subscription";
import { getApiToken } from "@/lib/db";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const invalidToken = await validateApiTokenResponse(request, getApiToken());
  if (invalidToken) return invalidToken;

  const { id } = await params;
  try {
    const subscriptionService = new SubscriptionService();
    const subscription = await subscriptionService.getById(id);

    if (!subscription) {
      return Response.json(
        { message: "Subscription not found" },
        { status: 404 },
      );
    }

    return Response.json({ subscription });
  } catch (error) {
    console.error("Error loading subscription:", error);
    const message =
      error instanceof Error && "cause" in error && error.cause instanceof Error
        ? error.cause.message
        : error instanceof Error
          ? error.message
          : "Couldn't load subscription";
    return Response.json({ message, success: false }, { status: 500 });
  }
}
