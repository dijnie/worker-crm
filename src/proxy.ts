import { NextResponse, type NextRequest } from "next/server";
import { AUTH_RETURN_TO_HEADER } from "@/lib/auth/safe-return-url";

export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  // Overwrite caller input; the server layout needs the actual requested path.
  headers.set(AUTH_RETURN_TO_HEADER, `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/", "/companies/:path*", "/contacts/:path*", "/deals/:path*", "/settings/:path*"],
};
