import { handleAuthRequest } from "@/lib/auth/auth";
import { getAuth, getAuthBaseUrl } from "@/lib/auth/request-context";
import { finalizeHttpResponse } from "@/lib/http/response";
import { reportRequestFailure } from "@/lib/server/error-reporting";

async function handle(request: Request): Promise<Response> {
  try { return await handleAuthRequest(request, getAuth(), getAuthBaseUrl()); }
  catch {
    return finalizeHttpResponse(request, reportRequestFailure(request, Response.json({ message: "Authentication is temporarily unavailable. Please retry." }, {
      status: 500, headers: { "cache-control": "no-store" },
    }), "auth_unexpected"));
  }
}

export const GET = handle;
export const POST = handle;
