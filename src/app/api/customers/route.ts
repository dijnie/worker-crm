import { validateApiTokenResponse } from "@/lib/api";
import { CustomerService } from "@/lib/services/customer";
import { getApiToken } from "@/lib/db";

export async function GET(request: Request) {
  const invalidToken = await validateApiTokenResponse(request, getApiToken());
  if (invalidToken) return invalidToken;

  try {
    const customerService = new CustomerService();
    const customers = await customerService.getAll();
    return Response.json({ customers });
  } catch (error) {
    console.error("Error loading customers:", error);
    const message =
      error instanceof Error && "cause" in error && error.cause instanceof Error
        ? error.cause.message
        : error instanceof Error
          ? error.message
          : "Couldn't load customers";
    return Response.json({ message, success: false }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const invalidToken = await validateApiTokenResponse(request, getApiToken());
  if (invalidToken) return invalidToken;

  try {
    const customerService = new CustomerService();
    const body = await request.json();
    const result = await customerService.create(body);

    if (result.success) {
      return Response.json(
        { message: "Customer created successfully", success: true },
        { status: 201 },
      );
    }
    return Response.json(
      { message: "Couldn't create customer", success: false },
      { status: 500 },
    );
  } catch (error) {
    console.error("Error creating customer:", error);
    const message =
      error instanceof Error && "cause" in error && error.cause instanceof Error
        ? error.cause.message
        : error instanceof Error
          ? error.message
          : "Couldn't create customer";
    return Response.json({ message, success: false }, { status: 500 });
  }
}
