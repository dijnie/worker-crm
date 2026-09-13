import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { getDb, type Database } from "@/lib/db";
import { session, singletonMembership } from "@/lib/db/schema";
import { ServiceError } from "@/lib/utils/service-error";
import { CloudflareEmailAdapter } from "@/lib/email/cloudflare-email-adapter";
import { createAuth } from "./auth";

type AuthEnvironment = {
  AUTH_BASE_URL: string;
  AUTH_EMAIL_FROM: string;
  BETTER_AUTH_SECRET: string;
  EMAIL: ConstructorParameters<typeof CloudflareEmailAdapter>[0]["binding"];
};

export interface AccountIdentity {
  id: string;
  name: string;
  email: string;
  role: "owner" | "member";
}

export interface RequestContext {
  db: Database;
  user: { id: string; name: string; email: string };
  membership: typeof singletonMembership.$inferSelect;
}

export function getAuthBaseUrl(): string {
  return (env as unknown as AuthEnvironment).AUTH_BASE_URL;
}

export function getAuth(db = getDb()) {
  const config = env as unknown as AuthEnvironment;
  return createAuth(db, { secret: config.BETTER_AUTH_SECRET, baseUrl: config.AUTH_BASE_URL },
    new CloudflareEmailAdapter({ binding: config.EMAIL, from: config.AUTH_EMAIL_FROM }));
}

export async function requireRequestContext(headers: Headers): Promise<RequestContext> {
  const db = getDb();
  // Rendering and private GETs cannot renew a cookie. The auth client's session
  // endpoint owns renewal and sends both the updated cookie and database expiry.
  const current = await getAuth(db).api.getSession({ headers, query: { disableRefresh: true } });
  if (!current?.user.emailVerified) throw new ServiceError(401, "Sign in is required", "UNAUTHENTICATED");
  // Read server-only version from storage even when Better Auth omits it from its public session response.
  const [state] = await db.select({ membership: singletonMembership, sessionVersion: session.accessVersion })
    .from(singletonMembership).innerJoin(session, eq(session.userId, singletonMembership.userId))
    .where(and(eq(singletonMembership.userId, current.user.id), eq(session.id, current.session.id)));
  if (!state || state.membership.status !== "active" || state.sessionVersion !== state.membership.accessVersion) {
    throw new ServiceError(403, "Active membership is required", "INACTIVE_MEMBERSHIP");
  }
  return { db, user: { id: current.user.id, name: current.user.name, email: current.user.email }, membership: state.membership };
}

export function requireOwner(context: RequestContext): void {
  if (context.membership.role !== "owner") throw new ServiceError(403, "Owner access is required", "FORBIDDEN_ACTION");
}
