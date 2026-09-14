export const AUTH_RETURN_TO_HEADER = "x-workspace-return-to";

export function signInUrl(returnTo: string | null | undefined): string {
  const destination = safeReturnUrl(returnTo);
  return destination === "/" ? "/sign-in" : `/sign-in?returnTo=${encodeURIComponent(destination)}`;
}

/** Keep post-auth navigation inside this application, including after URL decoding. */
export function safeReturnUrl(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  let decoded = value;
  for (let attempt = 0; attempt < 5; attempt++) {
    if (!decoded.startsWith("/") || decoded.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(decoded)) return "/";
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) return value;
      decoded = next;
    } catch {
      return "/";
    }
  }
  return "/";
}
