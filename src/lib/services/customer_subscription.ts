import { asc, eq, sql } from "drizzle-orm";
import {
  customerSubscriptions,
  getDb,
  type Database,
} from "@/lib/db";

export interface CustomerSubscriptionRecord {
  id: number;
  customer_id: number;
  subscription_id: number;
  status: "active" | "cancelled" | "expired" | string;
  subscription_starts_at: string;
  subscription_ends_at: string | number;
  created_at: string;
  updated_at: string;
  customer_name?: string;
  customer_email?: string;
  subscription_name?: string;
  subscription_description?: string;
  subscription_price?: number;
}

export class CustomerSubscriptionService {
  private db: Database;

  constructor(db: Database = getDb()) {
    this.db = db;
  }

  async getById(
    id: number | string,
  ): Promise<CustomerSubscriptionRecord | null> {
    const r = await this.db.query.customerSubscriptions.findFirst({
      where: eq(customerSubscriptions.id, Number(id)),
      with: {
        customer: true,
        subscription: true,
      },
    });

    if (!r) return null;

    return {
      id: r.id,
      customer_id: r.customerId,
      subscription_id: r.subscriptionId,
      status: r.status,
      subscription_starts_at: r.subscriptionStartsAt,
      subscription_ends_at: r.subscriptionEndsAt,
      created_at: r.createdAt,
      updated_at: r.updatedAt,
      customer_name: r.customer?.name,
      customer_email: r.customer?.email,
      subscription_name: r.subscription?.name,
      subscription_description: r.subscription?.description,
      subscription_price: r.subscription?.price,
    };
  }

  async getByCustomerId(
    customerId: number | string,
  ): Promise<CustomerSubscriptionRecord[]> {
    const records = await this.db.query.customerSubscriptions.findMany({
      where: eq(customerSubscriptions.customerId, Number(customerId)),
      with: {
        customer: true,
        subscription: true,
      },
    });

    return records.map((r) => ({
      id: r.id,
      customer_id: r.customerId,
      subscription_id: r.subscriptionId,
      status: r.status,
      subscription_starts_at: r.subscriptionStartsAt,
      subscription_ends_at: r.subscriptionEndsAt,
      created_at: r.createdAt,
      updated_at: r.updatedAt,
      customer_name: r.customer?.name,
      customer_email: r.customer?.email,
      subscription_name: r.subscription?.name,
      subscription_description: r.subscription?.description,
      subscription_price: r.subscription?.price,
    }));
  }

  async getAll(): Promise<CustomerSubscriptionRecord[]> {
    const records = await this.db.query.customerSubscriptions.findMany({
      orderBy: [asc(customerSubscriptions.id)],
      with: {
        customer: true,
        subscription: true,
      },
    });

    return records.map((r) => ({
      id: r.id,
      customer_id: r.customerId,
      subscription_id: r.subscriptionId,
      status: r.status,
      subscription_starts_at: r.subscriptionStartsAt,
      subscription_ends_at: r.subscriptionEndsAt,
      created_at: r.createdAt,
      updated_at: r.updatedAt,
      customer_name: r.customer?.name,
      customer_email: r.customer?.email,
      subscription_name: r.subscription?.name,
      subscription_description: r.subscription?.description,
      subscription_price: r.subscription?.price,
    }));
  }

  async create(customerSubscriptionData: {
    customer_id: number | string;
    subscription_id: number | string;
    status?: string;
    start_date?: string;
    end_date?: string;
    subscription_starts_at?: string;
    subscription_ends_at?: string;
  }): Promise<{ success: boolean; customerSubscriptionId?: number }> {
    const {
      customer_id,
      subscription_id,
      status = "active",
      start_date,
      end_date,
      subscription_starts_at,
      subscription_ends_at,
    } = customerSubscriptionData;

    const startsAt =
      start_date || subscription_starts_at || new Date().toISOString();
    const endsAt =
      end_date ||
      subscription_ends_at ||
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const [inserted] = await this.db
      .insert(customerSubscriptions)
      .values({
        customerId: Number(customer_id),
        subscriptionId: Number(subscription_id),
        status,
        subscriptionStartsAt: startsAt,
        subscriptionEndsAt: endsAt,
      })
      .returning({ id: customerSubscriptions.id });

    if (!inserted?.id) {
      throw new Error("Failed to create customer subscription");
    }

    return {
      success: true,
      customerSubscriptionId: inserted.id,
    };
  }

  async updateStatus(
    id: number | string,
    status: string,
  ): Promise<{ success: boolean }> {
    await this.db
      .update(customerSubscriptions)
      .set({ status, updatedAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(customerSubscriptions.id, Number(id)));

    return { success: true };
  }

  async updateSubscriptionEndsAt(
    id: number | string,
    subscriptionEndsAt: string,
  ): Promise<{ success: boolean }> {
    await this.db
      .update(customerSubscriptions)
      .set({
        subscriptionEndsAt,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(eq(customerSubscriptions.id, Number(id)));

    return { success: true };
  }
}
