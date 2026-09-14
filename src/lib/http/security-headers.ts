const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  // Vinext streams inline React scripts; Swagger and the app also use inline styles.
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' data:",
  process.env.NODE_ENV === "development"
    ? "connect-src 'self' ws: wss:"
    : "connect-src 'self'",
  "object-src 'none'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

export function applySecurityHeaders(response: Response, request: Request): Response {
  // Redirects and upstream fetch responses can have immutable headers. Rewrap
  // their stream without reading it, while retaining mutable NextResponse objects.
  try {
    response.headers.set("x-content-type-options", "nosniff");
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    response = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: new Headers(response.headers),
    });
    response.headers.set("x-content-type-options", "nosniff");
  }

  response.headers.set("content-security-policy", CONTENT_SECURITY_POLICY);
  response.headers.set("permissions-policy", "camera=(), microphone=(), geolocation=()");
  response.headers.set("referrer-policy", "strict-origin-when-cross-origin");
  response.headers.set("x-frame-options", "DENY");
  if (new URL(request.url).protocol === "https:") {
    response.headers.set("strict-transport-security", "max-age=31536000");
  } else {
    response.headers.delete("strict-transport-security");
  }
  return response;
}
