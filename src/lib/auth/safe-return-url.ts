/** Keep post-auth navigation inside this application, including after URL decoding. */
export function safeReturnUrl(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  let decoded = value;
  for (let attempt = 0; attempt < 5; attempt++) {
    if (!decoded.startsWith("/") || decoded.startsWith("//") || /[\\\u0000-\u0020\u007f]/.test(decoded)) return "/";
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
