import { validateApiTokenResponse } from "@/lib/api";
import { CustomerSubscriptionService } from "@/lib/services/customer_subscription";
import { getApiToken } from "@/lib/db";

export async function GET(request: Request) {
  const invalidToken = await validateApiTokenResponse(request, getApiToken());
  if (invalidToken) return invalidToken;

  try {
    const service = new CustomerSubscriptionService();
    const customer_subscriptions = await service.getAll();
    return Response.json({ customer_subscriptions });
  } catch (error) {
    console.error("Error loading customer subscriptions:", error);
    const message =
      error instanceof Error && "cause" in error && error.cause instanceof Error
        ? error.cause.message
        : error instanceof Error
          ? error.message
          : "Couldn't load customer subscriptions";
    return Response.json({ message, success: false }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const invalidToken = await validateApiTokenResponse(request, getApiToken());
  if (invalidToken) return invalidToken;

  try {
    const service = new CustomerSubscriptionService();
    const body = await request.json();
    const response = await service.create(body);

    if (response.success) {
      return Response.json(
        {
          message: "Customer subscription created successfully",
          success: true,
        },
        { status: 201 },
      );
    }
    return Response.json(
      { message: "Couldn't create customer subscription", success: false },
      { status: 500 },
    );
  } catch (error) {
    console.error("Error creating customer subscription:", error);
    const message =
      error instanceof Error && "cause" in error && error.cause instanceof Error
        ? error.cause.message
        : error instanceof Error
          ? error.message
          : "Couldn't create customer subscription";
    return Response.json({ message, success: false }, { status: 500 });
  }
}
