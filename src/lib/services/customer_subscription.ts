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

export const CUSTOMER_SUBSCRIPTION_QUERIES = {
  BASE_SELECT: `
    SELECT 
      customer_subscriptions.*,
      customers.name as customer_name,
      customers.email as customer_email,
      subscriptions.name as subscription_name,
      subscriptions.description as subscription_description,
      subscriptions.price as subscription_price
    FROM customer_subscriptions
    LEFT JOIN customers 
      ON customer_subscriptions.customer_id = customers.id
    LEFT JOIN subscriptions 
      ON customer_subscriptions.subscription_id = subscriptions.id
  `,
  INSERT_CUSTOMER_SUBSCRIPTION: `
    INSERT INTO customer_subscriptions (
      customer_id, 
      subscription_id, 
      status, 
      subscription_starts_at, 
      subscription_ends_at
    ) 
    VALUES (?, ?, ?, ?, ?)
  `,
  UPDATE_STATUS: `
    UPDATE customer_subscriptions 
    SET status = ? 
    WHERE id = ?
  `,
  UPDATE_SUBSCRIPTION_ENDS_AT: `
    UPDATE customer_subscriptions 
    SET subscription_ends_at = ? 
    WHERE id = ?
  `,
};

export class CustomerSubscriptionService {
  private DB: D1Database;

  constructor(DB: D1Database) {
    this.DB = DB;
  }

  async getById(id: number | string): Promise<CustomerSubscriptionRecord | null> {
    const query = `${CUSTOMER_SUBSCRIPTION_QUERIES.BASE_SELECT} WHERE customer_subscriptions.id = ?`;
    const response = await this.DB.prepare(query).bind(Number(id)).all<CustomerSubscriptionRecord>();

    if (response.success && response.results.length) {
      return response.results[0] || null;
    }
    return null;
  }

  async getByCustomerId(customerId: number | string): Promise<CustomerSubscriptionRecord[]> {
    const query = `${CUSTOMER_SUBSCRIPTION_QUERIES.BASE_SELECT} WHERE customer_subscriptions.customer_id = ?`;
    const response = await this.DB.prepare(query).bind(Number(customerId)).all<CustomerSubscriptionRecord>();

    if (response.success && response.results.length) {
      return response.results;
    }
    return [];
  }

  async getAll(): Promise<CustomerSubscriptionRecord[]> {
    const query = `${CUSTOMER_SUBSCRIPTION_QUERIES.BASE_SELECT} ORDER BY customer_subscriptions.id ASC`;
    const response = await this.DB.prepare(query).all<CustomerSubscriptionRecord>();

    if (response.success && response.results.length) {
      return response.results;
    }
    return [];
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

    const startsAt = start_date || subscription_starts_at || new Date().toISOString();
    const endsAt =
      end_date ||
      subscription_ends_at ||
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const response = await this.DB.prepare(
      CUSTOMER_SUBSCRIPTION_QUERIES.INSERT_CUSTOMER_SUBSCRIPTION,
    )
      .bind(
        Number(customer_id),
        Number(subscription_id),
        status,
        startsAt,
        endsAt,
      )
      .run();

    if (!response.success) {
      throw new Error("Failed to create customer subscription");
    }

    return {
      success: true,
      customerSubscriptionId: response.meta.last_row_id ?? undefined,
    };
  }

  async updateStatus(
    id: number | string,
    status: string,
  ): Promise<{ success: boolean }> {
    const response = await this.DB.prepare(
      CUSTOMER_SUBSCRIPTION_QUERIES.UPDATE_STATUS,
    )
      .bind(status, Number(id))
      .run();

    if (!response.success) {
      throw new Error("Failed to update customer subscription status");
    }

    return { success: true };
  }

  async updateSubscriptionEndsAt(
    id: number | string,
    subscriptionEndsAt: string,
  ): Promise<{ success: boolean }> {
    const response = await this.DB.prepare(
      CUSTOMER_SUBSCRIPTION_QUERIES.UPDATE_SUBSCRIPTION_ENDS_AT,
    )
      .bind(subscriptionEndsAt, Number(id))
      .run();

    if (!response.success) {
      throw new Error("Failed to update customer subscription end date");
    }

    return { success: true };
  }
}
