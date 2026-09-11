import { validateApiTokenResponse } from "@/lib/api";
import { CustomerService } from "@/lib/services/customer";
import { getApiToken } from "@/lib/db";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const invalidToken = await validateApiTokenResponse(request, getApiToken());
  if (invalidToken) return invalidToken;

  const { id } = await params;
  try {
    const customerService = new CustomerService();
    const customer = await customerService.getById(id);

    if (!customer) {
      return Response.json({ message: "Customer not found" }, { status: 404 });
    }

    return Response.json({ customer });
  } catch (error) {
    console.error("Error loading customer:", error);
    const message =
      error instanceof Error && "cause" in error && error.cause instanceof Error
        ? error.cause.message
        : error instanceof Error
          ? error.message
          : "Couldn't load customer";
    return Response.json({ message, success: false }, { status: 500 });
  }
}
