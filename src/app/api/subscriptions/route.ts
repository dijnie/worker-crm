import { validateApiTokenResponse } from "@/lib/api";
import { SubscriptionService } from "@/lib/services/subscription";
import { getApiToken } from "@/lib/db";

export async function GET(request: Request) {
  const invalidToken = await validateApiTokenResponse(request, getApiToken());
  if (invalidToken) return invalidToken;

  try {
    const subscriptionService = new SubscriptionService();
    const subscriptions = await subscriptionService.getAll();
    return Response.json({ subscriptions });
  } catch (error) {
    console.error("Error loading subscriptions:", error);
    const message =
      error instanceof Error && "cause" in error && error.cause instanceof Error
        ? error.cause.message
        : error instanceof Error
          ? error.message
          : "Couldn't load subscriptions";
    return Response.json({ message, success: false }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const invalidToken = await validateApiTokenResponse(request, getApiToken());
  if (invalidToken) return invalidToken;

  try {
    const subscriptionService = new SubscriptionService();
    const body = await request.json();
    await subscriptionService.create(body);

    return Response.json(
      {
        message: "Subscription created successfully",
        success: true,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error creating subscription:", error);
    const message =
      error instanceof Error && "cause" in error && error.cause instanceof Error
        ? error.cause.message
        : error instanceof Error
          ? error.message
          : "Failed to create subscription";
    return Response.json({ message, success: false }, { status: 500 });
  }
}
