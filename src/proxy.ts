import { NextResponse, type NextRequest } from "next/server";
import { AUTH_RETURN_TO_HEADER } from "@/lib/auth/safe-return-url";
import { applySecurityHeaders } from "@/lib/http/security-headers";

export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  // Overwrite caller input; the server layout needs the actual requested path.
  headers.set(AUTH_RETURN_TO_HEADER, `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return applySecurityHeaders(NextResponse.next({ request: { headers } }), request);
}

export const config = {
  matcher: ["/:path*"],
};
