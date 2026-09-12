function safeCompare(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index++) mismatch |= a[index] ^ b[index];
  return mismatch === 0;
}

export function validateApiToken(request: Request, configuredToken: string): boolean {
  const expected = configuredToken.trim();
  if (!expected) return false;
  const authorization = request.headers.get("authorization");
  const supplied = (authorization
    ? authorization.replace(/^(Bearer|Token) /, "")
    : request.headers.get("x-api-token") ?? "").trim();
  return supplied.length > 0 && safeCompare(expected, supplied);
}
