import { asc, eq } from "drizzle-orm";
import {
  createDatabase,
  customers,
  customerSubscriptions,
  type Database,
} from "@/lib/db";

export interface CustomerSubscriptionDetail {
  id: number;
  status: string;
  name: string;
  description: string;
  price: number;
}

export interface CustomerRecord {
  id: number;
  name: string;
  email: string;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  subscription?: CustomerSubscriptionDetail;
}

export class CustomerService {
  private db: Database;

  constructor(dbOrBinding: Database | D1Database) {
    if ("prepare" in dbOrBinding && typeof dbOrBinding.prepare === "function") {
      this.db = createDatabase(dbOrBinding);
    } else {
      this.db = dbOrBinding as Database;
    }
  }

  async getById(id: number | string): Promise<CustomerRecord | null> {
    const r = await this.db.query.customers.findFirst({
      where: eq(customers.id, Number(id)),
      with: {
        customerSubscriptions: {
          with: {
            subscription: true,
          },
        },
      },
    });

    if (!r) return null;

    const activeSub =
      r.customerSubscriptions.find((s) => s.status === "active") ||
      r.customerSubscriptions[0];

    const sub: CustomerSubscriptionDetail | undefined =
      activeSub && activeSub.subscription
        ? {
            id: activeSub.subscription.id,
            status: activeSub.status,
            name: activeSub.subscription.name,
            description: activeSub.subscription.description,
            price: activeSub.subscription.price,
          }
        : undefined;

    return {
      id: r.id,
      name: r.name,
      email: r.email,
      notes: r.notes,
      created_at: r.createdAt,
      updated_at: r.updatedAt,
      subscription: sub,
    };
  }

  async getByEmail(email: string): Promise<CustomerRecord | null> {
    const r = await this.db.query.customers.findFirst({
      where: eq(customers.email, email),
      with: {
        customerSubscriptions: {
          with: {
            subscription: true,
          },
        },
      },
    });

    if (!r) return null;

    const activeSub =
      r.customerSubscriptions.find((s) => s.status === "active") ||
      r.customerSubscriptions[0];

    const sub: CustomerSubscriptionDetail | undefined =
      activeSub && activeSub.subscription
        ? {
            id: activeSub.subscription.id,
            status: activeSub.status,
            name: activeSub.subscription.name,
            description: activeSub.subscription.description,
            price: activeSub.subscription.price,
          }
        : undefined;

    return {
      id: r.id,
      name: r.name,
      email: r.email,
      notes: r.notes,
      created_at: r.createdAt,
      updated_at: r.updatedAt,
      subscription: sub,
    };
  }

  async getAll(): Promise<CustomerRecord[]> {
    const records = await this.db.query.customers.findMany({
      orderBy: [asc(customers.id)],
      with: {
        customerSubscriptions: {
          with: {
            subscription: true,
          },
        },
      },
    });

    return records.map((r) => {
      const activeSub =
        r.customerSubscriptions.find((s) => s.status === "active") ||
        r.customerSubscriptions[0];

      const sub: CustomerSubscriptionDetail | undefined =
        activeSub && activeSub.subscription
          ? {
              id: activeSub.subscription.id,
              status: activeSub.status,
              name: activeSub.subscription.name,
              description: activeSub.subscription.description,
              price: activeSub.subscription.price,
            }
          : undefined;

      return {
        id: r.id,
        name: r.name,
        email: r.email,
        notes: r.notes,
        created_at: r.createdAt,
        updated_at: r.updatedAt,
        subscription: sub,
      };
    });
  }

  async create(customerData: {
    name: string;
    email: string;
    notes?: string;
    subscription?: {
      id: number;
      status: string;
    };
  }): Promise<{ success: boolean; customerId?: number }> {
    const { name, email, notes, subscription } = customerData;

    const [inserted] = await this.db
      .insert(customers)
      .values({
        name,
        email,
        notes: notes || null,
      })
      .returning({ id: customers.id });

    if (!inserted?.id) {
      throw new Error("Failed to create customer");
    }

    if (subscription) {
      const endsAt = new Date(
        Date.now() + 30 * 24 * 60 * 60 * 1000,
      ).toISOString();

      await this.db.insert(customerSubscriptions).values({
        customerId: inserted.id,
        subscriptionId: subscription.id,
        status: subscription.status,
        subscriptionEndsAt: endsAt,
      });
    }

    return { success: true, customerId: inserted.id };
  }
}
