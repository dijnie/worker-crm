import { handleAuthRequest } from "@/lib/auth/auth";
import { getAuth, getAuthBaseUrl } from "@/lib/auth/request-context";

async function handle(request: Request): Promise<Response> {
  return handleAuthRequest(request, getAuth(), getAuthBaseUrl());
}

export const GET = handle;
export const POST = handle;
