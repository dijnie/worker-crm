import { AsyncLocalStorage } from "node:async_hooks";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { APIError, isAPIError } from "better-auth/api";
import { betterAuth } from "better-auth/minimal";
import type { Database } from "../db";
import * as schema from "../db/schema";
import type { AuthEmailAdapter } from "../email/email-adapter";
import { reconcileSingletonMembership } from "@services/member.service";
import { ServiceError } from "../utils/service-error";
import { normalizeEmail } from "./normalize-email";
import { reportRequestFailure } from "../server/error-reporting";

export interface AuthConfiguration {
  secret: string;
  baseUrl: string;
}

export function parseCanonicalOrigin(value: string): URL {
  const url = new URL(value);
  if ((url.protocol !== "https:" && !(url.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) ||
    url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Auth base URL must be a canonical HTTPS origin or HTTP loopback origin");
  }
  return url;
}

export function createAuth(db: Database, config: AuthConfiguration, emailAdapter: AuthEmailAdapter) {
  if (config.secret.length < 32) throw new Error("BETTER_AUTH_SECRET must be at least 32 characters");
  const baseUrl = parseCanonicalOrigin(config.baseUrl);
  const emailUrl = (value: string) => {
    const url = new URL(value);
    if (url.origin !== baseUrl.origin) throw new Error("Auth email URL has an untrusted origin");
    return url.toString();
  };
  const delivery = new AsyncLocalStorage<{ failed: boolean }>();
  const send = async (operation: () => Promise<void>) => {
    try { await operation(); } catch {
      const state = delivery.getStore();
      if (state) state.failed = true;
      throw new APIError("SERVICE_UNAVAILABLE", { message: "Email delivery is unavailable. Please retry." });
    }
  };
  const auth = betterAuth({
    appName: "CRM",
    baseURL: baseUrl.origin,
    secret: config.secret,
    trustedOrigins: [baseUrl.origin],
    database: drizzleAdapter(db, { provider: "sqlite", schema, transaction: false }),
    session: {
      expiresIn: 60 * 60,
      updateAge: 5 * 60,
      cookieCache: { enabled: false },
      additionalFields: {
        accessVersion: { type: "number", required: true, defaultValue: 0, input: false, returned: false },
      },
    },
    emailAndPassword: {
      enabled: true,
      autoSignIn: false,
      requireEmailVerification: true,
      resetPasswordTokenExpiresIn: 15 * 60,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await send(() => emailAdapter.sendPasswordReset({ to: user.email, url: emailUrl(url) }));
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: false,
      expiresIn: 60 * 60,
      autoSignInAfterVerification: false,
      sendVerificationEmail: async ({ user, url }) => {
        await send(() => emailAdapter.sendVerification({ to: user.email, url: emailUrl(url) }));
      },
      afterEmailVerification: async (user) => { await reconcileSingletonMembership(db, user.id); },
    },
    databaseHooks: {
      session: { create: { before: async (data) => {
        const currentUser = await db.query.user.findFirst({ where: (table, { eq }) => eq(table.id, data.userId) });
        if (!currentUser?.emailVerified) throw new APIError("FORBIDDEN", { message: "Email verification required" });
        try {
          const membership = await reconcileSingletonMembership(db, data.userId);
          if (membership.status !== "active") throw new ServiceError(403, "Inactive membership");
          return { data: { ...data, accessVersion: membership.accessVersion } };
        } catch (error) {
          if (!(error instanceof ServiceError) || error.status !== 403) throw error;
          throw new APIError("FORBIDDEN", { code: "ACCESS_REVOKED", message: "Workspace access is revoked" });
        }
      } } },
    },
    rateLimit: {
      enabled: true, storage: "database", window: 60, max: 100,
      customRules: {
        "/sign-up/email": { window: 60, max: 5 },
        "/sign-in/email": { window: 60, max: 10 },
        "/request-password-reset": { window: 60, max: 5 },
        "/send-verification-email": { window: 60, max: 5 },
        "/verify-email": { window: 60, max: 10 },
        "/reset-password": { window: 60, max: 5 },
      },
    },
    advanced: {
      database: { joins: true },
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
      useSecureCookies: baseUrl.protocol === "https:",
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax" },
    },
    logger: { disabled: true },
    onAPIError: {
      onError(error) {
        if (isAPIError(error)) return;
        let cause: unknown = error;
        for (let depth = 0; depth < 6 && cause instanceof Error; depth++) {
          if (cause.message.includes("auth_session_access_denied")) throw new APIError("FORBIDDEN", {
            code: "SESSION_ISSUANCE_REJECTED", message: "Access changed during sign in. Please try again.",
          });
          cause = (cause as Error & { cause?: unknown }).cause;
        }
        // The router otherwise logs raw adapter errors, including bound credential data.
        throw new APIError("INTERNAL_SERVER_ERROR", { message: "Authentication is temporarily unavailable. Please retry." });
      },
    },
  });
  const handler = auth.handler;
  // Better Auth awaits signup/reset delivery but swallows callback failures.
  // Keep the outcome request-local so a failed send cannot produce a success response.
  auth.handler = (request) => delivery.run({ failed: false }, async () => {
    const response = await handler(request);
    if (delivery.getStore()?.failed) return reportRequestFailure(request, Response.json({
      code: "EMAIL_DELIVERY_UNAVAILABLE", message: "Email delivery is unavailable. Please retry or resend verification.",
    }, { status: 503, headers: { "cache-control": "no-store" } }), "email_delivery_failed");
    return reportRequestFailure(request, response, "auth_unexpected");
  });
  return auth;
}

export async function handleAuthRequest(request: Request, auth: ReturnType<typeof createAuth>, authBaseUrl: string): Promise<Response> {
  const incoming = new URL(request.url);
  const canonical = parseCanonicalOrigin(authBaseUrl);
  const url = new URL(`${incoming.pathname}${incoming.search}`, canonical);
  const headers = new Headers(request.headers);
  // Vinext can expose HTTP transport behind canonical HTTPS. Normalize only the same host.
  if (incoming.host === canonical.host && headers.get("origin") === incoming.origin) headers.set("origin", canonical.origin);
  const path = incoming.pathname.replace(/^\/api\/auth/, "");
  let body: BodyInit | null = request.method === "GET" || request.method === "HEAD" ? null : request.body;
  if (request.method === "POST" && ["/sign-up/email", "/sign-in/email", "/send-verification-email", "/request-password-reset"].includes(path)) {
    let parsed: Record<string, unknown>;
    try { parsed = await request.json(); } catch { return Response.json({ message: "Invalid request" }, { status: 400, headers: { "cache-control": "no-store" } }); }
    if (!parsed || typeof parsed !== "object" || typeof parsed.email !== "string") return Response.json({ message: "Invalid request" }, { status: 400, headers: { "cache-control": "no-store" } });
    body = JSON.stringify({ ...parsed, email: normalizeEmail(parsed.email) });
    headers.set("content-type", "application/json");
  }
  const response = await auth.handler(new Request(url, { method: request.method, headers, body }));
  response.headers.set("cache-control", "no-store");
  return response;
}
